// src/system-settings/runtime-settings.preload.ts
/**
 * ✅ PRÉCHARGEMENT DES PARAMÈTRES (premier import de main.ts)
 *
 * Avant le chargement des modules NestJS, les paramètres actifs de la table system_settings
 * remplacent les valeurs du .env dans process.env. Ainsi TOUT le code existant
 * (process.env.X, ConfigService.get('X'), constantes lues au chargement) utilise les valeurs de la base,
 * sans modifier les services.
 *
 * Lecture SYNCHRONE (petit processus Node enfant + mysql2) : obligatoire pour être prêt avant les imports.
 * En cas d'erreur (table absente, MySQL indisponible…), l'API démarre normalement avec le .env.
 */
import * as dotenv from 'dotenv';
import { execFileSync } from 'child_process';
import { Logger } from '@nestjs/common';
import { dataSourceOptions } from 'db/data-source';
import { PROTECTED_SETTING_KEYS } from './settings.catalog';
import { decryptSettingValue } from './settings-crypto';
import { applySettingToEnv, runtimeSettings, settingsEnabled } from './runtime-settings.state';

dotenv.config();

const CHILD_SCRIPT = `
const mysql = require(process.env.__FS_MYSQL2);
const c = JSON.parse(process.env.__FS_CONN || '{}');
const out = (o) => process.stdout.write(JSON.stringify(o));
(async () => {
  let conn;
  try {
    conn = await mysql.createConnection({ host: c.host, port: c.port, user: c.user, password: c.password, database: c.database, connectTimeout: 5000, charset: 'utf8mb4' });
    const [rows] = await conn.query('SELECT \`settingKey\`, \`value\`, \`isSecret\` FROM \`system_settings\` WHERE \`isActive\` = 1');
    out({ ok: true, rows });
  } catch (e) {
    out({ ok: false, code: e && e.code, error: String((e && e.message) || e) });
  } finally {
    if (conn) await conn.end().catch(() => undefined);
  }
})();
`;

function preload(): void {
  const state = runtimeSettings();
  const logger = new Logger('Paramètres');
  // Valeurs du .env avant la base (pour revenir au .env quand un paramètre est désactivé / supprimé)
  state.baseline = { ...process.env };
  if (!settingsEnabled()) {
    state.preload = { loadedAt: null, count: 0, error: null, skipped: true };
    return;
  }
  const o: any = dataSourceOptions;
  try {
    const raw = execFileSync(process.execPath, ['-e', CHILD_SCRIPT], {
      env: {
        PATH: process.env.PATH ?? '',
        __FS_MYSQL2: require.resolve('mysql2/promise'),
        __FS_CONN: JSON.stringify({
          host: o.host ?? '127.0.0.1',
          port: Number(o.port ?? 3306),
          user: o.username,
          password: o.password ?? '',
          database: o.database,
        }),
      },
      timeout: Number(process.env.SETTINGS_PRELOAD_TIMEOUT_MS || 10000),
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString('utf8');
    const res = JSON.parse(raw || '{}');
    if (!res.ok) {
      const missing = res.code === 'ER_NO_SUCH_TABLE';
      state.preload = { loadedAt: null, count: 0, error: missing ? null : res.error, skipped: missing };
      if (!missing) logger.warn(`Paramètres de la base non chargés (${res.error}) : valeurs du .env utilisées`);
      return;
    }
    let count = 0;
    for (const r of res.rows ?? []) {
      const key = String(r.settingKey || '');
      if (!key || PROTECTED_SETTING_KEYS.has(key)) continue;
      try {
        const value = Number(r.isSecret) ? decryptSettingValue(r.value) : String(r.value ?? '');
        applySettingToEnv(key, value);
        count++;
      } catch (e: any) {
        logger.warn(`Paramètre ${key} illisible (${e?.message}) : valeur du .env conservée`);
      }
    }
    state.preload = { loadedAt: new Date(), count, error: null, skipped: false };
    if (count) logger.log(`⚙️ ${count} paramètre(s) chargé(s) depuis la base (system_settings)`);
  } catch (e: any) {
    state.preload = { loadedAt: null, count: 0, error: String(e?.message ?? e).slice(0, 500), skipped: false };
    logger.warn(`Paramètres de la base non chargés (${state.preload.error}) : valeurs du .env utilisées`);
  }
}

preload();
