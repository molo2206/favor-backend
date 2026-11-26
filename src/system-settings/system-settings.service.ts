// src/system-settings/system-settings.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { I18nService } from 'src/libs/common/src';
import { AuditService } from 'src/audit/audit.service';
import { paginated, pageParams, paginateArray } from 'src/common/pagination/paginate.util';
import {
  PROTECTED_SETTING_KEYS,
  SETTING_CATEGORIES,
  SETTING_KEY_REGEX,
  SETTINGS_CATALOG,
  SYSTEM_ENV_KEYS,
  catalogEntry,
} from './settings.catalog';
import { decryptSettingValue, encryptSettingValue, maskSecret, settingsEncryptionAvailable } from './settings-crypto';
import { SettingHistoryAction, SystemSetting, SystemSettingHistory } from './system-setting.entity';
import { applySettingToEnv, baselineValue, runtimeSettings, settingsEnabled } from './runtime-settings.state';
import {
  BulkSystemSettingsDto,
  ExportSystemSettingsQueryDto,
  ImportSystemSettingsDto,
  SystemSettingHistoryQueryDto,
  SystemSettingsQueryDto,
  UpsertSystemSettingDto,
} from './system-settings.dto';

type Actor = { id?: string | null; fullName?: string | null; role?: any };
type Source = 'DATABASE' | 'ENV' | 'UNSET' | 'PROTECTED';

const MAX_VALUE = 20000;

/**
 * ✅ PARAMÈTRES SYSTÈME (clés du .env gérées en base)
 *
 *  - Lecture : catalogue des clés connues + lignes de system_settings + valeurs actuelles du serveur.
 *  - Écriture : la valeur est enregistrée (chiffrée si secrète), historisée, puis appliquée tout de suite
 *    à process.env sur cette instance ; les autres instances (PM2 cluster) la reprennent sous
 *    SETTINGS_REFRESH_SECONDS secondes. Les clés lues au démarrage (restart = true) demandent un redémarrage.
 *  - Désactiver / supprimer une ligne → retour automatique à la valeur du .env.
 *  - Clés protégées (connexion MySQL, NODE_ENV, clés de chiffrement…) : toujours dans le .env.
 */
@Injectable()
export class SystemSettingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemSettingsService.name);
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;
  private tableMissingLogged = false;

  constructor(
    @InjectRepository(SystemSetting) private readonly settings: Repository<SystemSetting>,
    @InjectRepository(SystemSettingHistory) private readonly history: Repository<SystemSettingHistory>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly i18n?: I18nService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private t(key: string, lang = 'fr', params?: Record<string, any>): string {
    try {
      return this.i18n ? this.i18n.translate(`system_settings.${key}`, lang, params) : key;
    } catch {
      return key;
    }
  }

  // ============================================================
  // SYNCHRONISATION (process.env ← base)
  // ============================================================
  private get refreshSeconds(): number {
    const n = Number(process.env.SETTINGS_REFRESH_SECONDS ?? 30);
    return Number.isFinite(n) && n >= 0 ? n : 30;
  }

  async onModuleInit() {
    if (!settingsEnabled()) return;
    // Préchargement absent (ancien main.ts) : application au démarrage du module
    const state = runtimeSettings();
    if (!state.preload.loadedAt) await this.sync(true).catch(() => undefined);
    else await this.sync(false).catch(() => undefined);
    if (this.refreshSeconds > 0) {
      this.timer = setInterval(() => void this.sync(false).catch(() => undefined), this.refreshSeconds * 1000);
      this.timer.unref?.();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private isMissingTable(e: any): boolean {
    return e?.code === 'ER_NO_SUCH_TABLE' || e?.driverError?.code === 'ER_NO_SUCH_TABLE' || /doesn't exist/i.test(String(e?.message));
  }

  /** Recharge les paramètres de la base si quelque chose a changé (ou toujours si force) */
  async sync(force: boolean): Promise<{ applied: number; restored: number; changed: boolean }> {
    if (this.syncing || !settingsEnabled()) return { applied: 0, restored: 0, changed: false };
    this.syncing = true;
    const state = runtimeSettings();
    try {
      const sig = await this.dataSource
        .query('SELECT COUNT(*) AS n, SUM(`isActive`) AS a, MAX(`updatedAt`) AS m FROM `system_settings`')
        .then((r: any[]) => `${r?.[0]?.n}|${r?.[0]?.a}|${r?.[0]?.m ? new Date(r[0].m).getTime() : 0}`);
      state.lastSyncAt = new Date();
      if (!force && sig === state.signature) return { applied: 0, restored: 0, changed: false };

      const rows = await this.settings.find({ where: { isActive: true } });
      const next = new Map<string, string>();
      for (const r of rows) {
        if (PROTECTED_SETTING_KEYS.has(r.settingKey)) continue;
        try {
          next.set(r.settingKey, r.isSecret ? decryptSettingValue(r.value) : String(r.value ?? ''));
        } catch (e: any) {
          this.logger.warn(`Paramètre ${r.settingKey} illisible (${e?.message}) : valeur du .env conservée`);
        }
      }
      let applied = 0;
      let restored = 0;
      for (const key of [...state.applied.keys()]) {
        if (!next.has(key)) {
          applySettingToEnv(key, null);
          restored++;
        }
      }
      for (const [key, value] of next) {
        if (state.applied.get(key) !== value || process.env[key] !== value) {
          applySettingToEnv(key, value);
          applied++;
        }
      }
      state.signature = sig;
      if (applied || restored) this.logger.log(`⚙️ Paramètres synchronisés : ${applied} appliqué(s), ${restored} remis au .env`);
      return { applied, restored, changed: true };
    } catch (e: any) {
      if (this.isMissingTable(e)) {
        if (!this.tableMissingLogged) this.logger.warn('Table system_settings absente : exécutez db/sql/parametres_systeme.sql');
        this.tableMissingLogged = true;
      } else {
        this.logger.warn(`Synchronisation des paramètres : ${e?.message}`);
      }
      return { applied: 0, restored: 0, changed: false };
    } finally {
      this.syncing = false;
    }
  }

  // ============================================================
  // OUTILS
  // ============================================================
  private actorName(user: Actor): string | null {
    return user?.fullName ? String(user.fullName).slice(0, 150) : null;
  }

  private assertKey(key: string, lang: string): string {
    const k = String(key ?? '').trim().toUpperCase();
    if (!SETTING_KEY_REGEX.test(k)) throw new BadRequestException(this.t('invalid_key', lang));
    if (PROTECTED_SETTING_KEYS.has(k)) throw new BadRequestException(this.t('protected', lang, { key: k }));
    return k;
  }

  private plain(row: SystemSetting | null | undefined, lang = 'fr'): string | null {
    if (!row) return null;
    if (!row.isSecret) return row.value ?? '';
    try {
      return decryptSettingValue(row.value);
    } catch {
      throw new BadRequestException(this.t('decrypt_failed', lang, { key: row.settingKey }));
    }
  }

  private safePlain(row: SystemSetting): string | null {
    try {
      return this.plain(row);
    } catch {
      return null;
    }
  }

  private store(value: string, isSecret: boolean, lang: string): string {
    if (!isSecret) return value;
    if (!settingsEncryptionAvailable()) throw new BadRequestException(this.t('no_encryption_key', lang));
    return encryptSettingValue(value);
  }

  /** Normalise et contrôle la valeur selon le type du catalogue */
  private normalize(key: string, value: string, lang: string): string {
    const type = catalogEntry(key).type;
    let v = String(value ?? '');
    if (v.length > MAX_VALUE) throw new BadRequestException(this.t('too_long', lang));
    if (type !== 'multiline') v = v.replace(/\r?\n/g, '').trim();
    if (v === '') return v;
    if (type === 'boolean') {
      const b = v.toLowerCase();
      if (!['true', 'false'].includes(b)) throw new BadRequestException(this.t('invalid_boolean', lang, { key }));
      return b;
    }
    if (type === 'number' && !/^-?\d+(\.\d+)?$/.test(v)) throw new BadRequestException(this.t('invalid_number', lang, { key }));
    if (type === 'url' && !/^https?:\/\/\S+$/i.test(v)) throw new BadRequestException(this.t('invalid_url', lang, { key }));
    return v;
  }

  private pendingRestart(key: string, row?: SystemSetting | null): boolean {
    if (!catalogEntry(key).restart || !row) return false;
    return new Date(row.updatedAt).getTime() > runtimeSettings().bootAt.getTime();
  }

  private sourceOf(key: string, row?: SystemSetting | null): Source {
    if (PROTECTED_SETTING_KEYS.has(key)) return 'PROTECTED';
    if (row?.isActive) return 'DATABASE';
    return baselineValue(key) !== undefined ? 'ENV' : 'UNSET';
  }

  /** Vue d'un paramètre : les secrets ne sont jamais renvoyés en clair */
  private view(key: string, row?: SystemSetting | null) {
    const c = catalogEntry(key);
    const isSecret = row ? row.isSecret : c.secret;
    const dbValue = row ? this.safePlain(row) : null;
    const envValue = baselineValue(key);
    const effective = process.env[key];
    const show = (v: string | null | undefined) => (v === undefined ? null : isSecret ? maskSecret(v) : v);
    return {
      key,
      category: row?.category || c.category,
      categoryLabel: SETTING_CATEGORIES[row?.category || c.category] ?? SETTING_CATEGORIES.other,
      description: row?.description || c.description || null,
      type: c.type,
      isSecret,
      isProtected: PROTECTED_SETTING_KEYS.has(key),
      inCatalog: !!SETTINGS_CATALOG[key],
      requiresRestart: c.restart,
      pendingRestart: this.pendingRestart(key, row),
      source: this.sourceOf(key, row),
      inDatabase: !!row,
      isActive: row ? row.isActive : null,
      /** Valeur enregistrée en base (masquée si secrète) */
      value: row ? show(dbValue) : null,
      unreadable: !!row && row.isSecret && dbValue === null,
      /** Valeur du .env (masquée si secrète) */
      envValue: show(envValue),
      /** Valeur utilisée actuellement par l'API (masquée si secrète) */
      effectiveValue: show(effective),
      hasValue: effective !== undefined && effective !== '',
      differsFromEnv: !!row && dbValue !== null && envValue !== undefined && dbValue !== envValue,
      updatedAt: row?.updatedAt ?? null,
      updatedByName: row?.updatedByName ?? null,
    };
  }

  private async rowsMap(): Promise<Map<string, SystemSetting>> {
    try {
      const rows = await this.settings.find();
      return new Map(rows.map((r) => [r.settingKey, r]));
    } catch (e: any) {
      if (this.isMissingTable(e)) throw new BadRequestException(this.t('table_missing'));
      throw e;
    }
  }

  private historyRow(
    key: string,
    action: SettingHistoryAction,
    isSecret: boolean,
    oldStored: string | null | undefined,
    newStored: string | null | undefined,
    user: Actor,
    note?: string | null,
  ): SystemSettingHistory {
    return this.history.create({
      settingKey: key,
      action,
      isSecret,
      oldValue: oldStored ?? null,
      newValue: newStored ?? null,
      note: note ? String(note).slice(0, 300) : null,
      changedById: user?.id ?? null,
      changedByName: this.actorName(user),
    });
  }

  // ============================================================
  // LECTURE
  // ============================================================
  async list(q: SystemSettingsQueryDto, lang = 'fr') {
    const rows = await this.rowsMap();
    const keys = new Set<string>([...Object.keys(SETTINGS_CATALOG), ...rows.keys()]);
    const search = (q.search ?? '').trim().toLowerCase();
    let items = [...keys].sort().map((k) => this.view(k, rows.get(k)));

    const counts: Record<string, number> = {};
    for (const it of items) counts[it.category] = (counts[it.category] ?? 0) + 1;

    if (q.category) items = items.filter((i) => i.category === q.category);
    if (q.source) items = items.filter((i) => i.source === q.source);
    if (q.secret !== undefined) items = items.filter((i) => i.isSecret === q.secret);
    if (q.pendingRestart) items = items.filter((i) => i.pendingRestart);
    if (search) {
      items = items.filter(
        (i) => i.key.toLowerCase().includes(search) || String(i.description ?? '').toLowerCase().includes(search),
      );
    }
    const page = paginateArray(items, q, 50, 300);
    return {
      message: this.t('list', lang),
      data: Object.assign(page, {
        categories: Object.entries(SETTING_CATEGORIES).map(([code, label]) => ({ code, label, count: counts[code] ?? 0 })),
        summary: {
          total: keys.size,
          inDatabase: rows.size,
          active: [...rows.values()].filter((r) => r.isActive).length,
          pendingRestart: [...rows.values()].filter((r) => this.pendingRestart(r.settingKey, r)).map((r) => r.settingKey),
        },
      }),
    };
  }

  async findOne(key: string, lang = 'fr') {
    const k = String(key ?? '').trim().toUpperCase();
    if (!SETTING_KEY_REGEX.test(k)) throw new BadRequestException(this.t('invalid_key', lang));
    const row = await this.settings.findOne({ where: { settingKey: k } }).catch((e) => {
      if (this.isMissingTable(e)) throw new BadRequestException(this.t('table_missing', lang));
      throw e;
    });
    const recent = row ? await this.history.find({ where: { settingKey: k }, order: { createdAt: 'DESC' }, take: 10 }) : [];
    return { message: this.t('detail', lang), data: { ...this.view(k, row), history: recent.map((h) => this.historyView(h)) } };
  }

  categories(lang = 'fr') {
    return {
      message: this.t('list', lang),
      data: Object.entries(SETTING_CATEGORIES).map(([code, label]) => ({ code, label })),
    };
  }

  async status(lang = 'fr') {
    const state = runtimeSettings();
    const envFile = this.envFilePath();
    let inDatabase = 0;
    let active = 0;
    let tableExists = true;
    try {
      const r = await this.dataSource.query('SELECT COUNT(*) AS n, SUM(`isActive`) AS a FROM `system_settings`');
      inDatabase = Number(r?.[0]?.n ?? 0);
      active = Number(r?.[0]?.a ?? 0);
    } catch (e: any) {
      if (this.isMissingTable(e)) tableExists = false;
    }
    return {
      message: this.t('status', lang),
      data: {
        enabled: settingsEnabled(),
        tableExists,
        encryptionAvailable: settingsEncryptionAvailable(),
        inDatabase,
        active,
        appliedOnThisInstance: state.applied.size,
        preload: state.preload,
        bootAt: state.bootAt,
        lastSyncAt: state.lastSyncAt,
        refreshSeconds: this.refreshSeconds,
        instance: { pid: process.pid, pm2Id: process.env.pm_id ?? process.env.NODE_APP_INSTANCE ?? null },
        envFile: { path: envFile, exists: fs.existsSync(envFile) },
        protectedKeys: [...PROTECTED_SETTING_KEYS],
      },
    };
  }

  private historyView(h: SystemSettingHistory) {
    const show = (v: string | null | undefined) => {
      if (v === null || v === undefined) return null;
      if (!h.isSecret) return v;
      try {
        return maskSecret(decryptSettingValue(v));
      } catch {
        return '••••••••';
      }
    };
    return {
      id: h.id,
      key: h.settingKey,
      action: h.action,
      isSecret: h.isSecret,
      oldValue: show(h.oldValue),
      newValue: show(h.newValue),
      note: h.note ?? null,
      changedById: h.changedById ?? null,
      changedByName: h.changedByName ?? null,
      createdAt: h.createdAt,
    };
  }

  async listHistory(q: SystemSettingHistoryQueryDto, lang = 'fr') {
    const { page, limit, skip } = pageParams(q, 30, 100);
    const qb = this.history.createQueryBuilder('h').orderBy('h.createdAt', 'DESC').skip(skip).take(limit);
    if (q.key) qb.andWhere('h.settingKey = :key', { key: q.key });
    if (q.action) qb.andWhere('h.action = :action', { action: q.action });
    const [rows, total] = await qb.getManyAndCount().catch((e) => {
      if (this.isMissingTable(e)) throw new BadRequestException(this.t('table_missing', lang));
      throw e;
    });
    return { message: this.t('history', lang), data: paginated(rows.map((h) => this.historyView(h)), total, page, limit) };
  }

  /** Valeur en clair d'un secret (super admin, journalisé par le contrôleur) */
  async reveal(key: string, lang = 'fr') {
    const k = String(key ?? '').trim().toUpperCase();
    if (!SETTING_KEY_REGEX.test(k)) throw new BadRequestException(this.t('invalid_key', lang));
    const row = await this.settings.findOne({ where: { settingKey: k } }).catch(() => null);
    const value = row ? this.plain(row, lang) : process.env[k] ?? null;
    this.audit?.annotate({ entity: 'system_settings', entityId: k, metadata: { key: k, revealed: true } });
    return {
      message: this.t('revealed', lang),
      data: { key: k, value, envValue: PROTECTED_SETTING_KEYS.has(k) ? null : baselineValue(k) ?? null, source: this.sourceOf(k, row) },
    };
  }

  // ============================================================
  // ÉCRITURE
  // ============================================================
  /** Créer / modifier une clé (valeur appliquée immédiatement si active) */
  async upsert(key: string, dto: UpsertSystemSettingDto, user: Actor, lang = 'fr', action?: SettingHistoryAction) {
    const k = this.assertKey(key, lang);
    const existing = await this.settings.findOne({ where: { settingKey: k } }).catch((e) => {
      if (this.isMissingTable(e)) throw new BadRequestException(this.t('table_missing', lang));
      throw e;
    });
    if (!existing && dto.value === undefined) throw new BadRequestException(this.t('value_required', lang));

    const c = catalogEntry(k);
    const isSecret = dto.isSecret ?? existing?.isSecret ?? c.secret;
    const oldPlain = existing ? this.safePlain(existing) : null;
    const newPlain = dto.value !== undefined ? this.normalize(k, dto.value, lang) : oldPlain ?? '';
    if (existing && dto.value === undefined && oldPlain === null && isSecret !== existing.isSecret) {
      throw new BadRequestException(this.t('decrypt_failed', lang, { key: k }));
    }

    const row = existing ?? this.settings.create({ settingKey: k });
    const oldStored = existing?.value ?? null;
    const oldSecret = existing?.isSecret ?? isSecret;
    // Valeur inchangée (seulement état / description) : la valeur enregistrée est gardée telle quelle
    const keepStored = !!existing && dto.value === undefined && isSecret === existing.isSecret;
    row.value = keepStored ? existing!.value ?? null : this.store(newPlain, isSecret, lang);
    row.isSecret = isSecret;
    row.isActive = dto.isActive ?? existing?.isActive ?? true;
    row.category = (dto.category && SETTING_CATEGORIES[dto.category] ? dto.category : existing?.category) || c.category;
    if (dto.description !== undefined) row.description = dto.description || null;
    else if (!existing) row.description = null;
    row.updatedById = user?.id ?? null;
    row.updatedByName = this.actorName(user);

    const histAction =
      action ??
      (!existing
        ? SettingHistoryAction.CREATE
        : dto.value === undefined && dto.isActive !== undefined && dto.isActive !== existing.isActive
          ? dto.isActive
            ? SettingHistoryAction.ENABLE
            : SettingHistoryAction.DISABLE
          : SettingHistoryAction.UPDATE);

    const saved = await this.dataSource.transaction(async (m) => {
      const s = await m.save(SystemSetting, row);
      // Ancienne valeur d'un secret : gardée chiffrée ; si on passe de non secret à secret, on la chiffre
      const oldForHistory = oldStored !== null && isSecret && !oldSecret ? this.store(oldStored, true, lang) : oldStored;
      await m.save(SystemSettingHistory, this.historyRow(k, histAction, isSecret, oldForHistory, row.value, user, dto.note));
      return s;
    });

    const applied = keepStored ? oldPlain : newPlain;
    if (saved.isActive && applied !== null) applySettingToEnv(k, applied);
    else if (!saved.isActive) applySettingToEnv(k, null);
    runtimeSettings().signature = null;
    this.audit?.annotate({ entity: 'system_settings', entityId: k, metadata: { key: k, isSecret, action: histAction } });

    const restart = c.restart && (dto.value !== undefined || dto.isActive !== undefined);
    const message = !saved.isActive
      ? this.t('disabled', lang, { key: k })
      : restart
        ? this.t('saved_restart', lang, { key: k })
        : this.t('saved', lang, { key: k });
    return { message, data: this.view(k, saved) };
  }

  /** Plusieurs clés en une fois (tout ou rien) */
  async bulk(dto: BulkSystemSettingsDto, user: Actor, lang = 'fr') {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const it of dto.items) {
      if (seen.has(it.key)) dup.add(it.key);
      seen.add(it.key);
    }
    if (dup.size) throw new BadRequestException(this.t('duplicate_keys', lang, { keys: [...dup].join(', ') }));

    const rows = await this.rowsMap();
    const prepared: { key: string; row: SystemSetting; plain: string; hist: SystemSettingHistory }[] = [];
    for (const it of dto.items) {
      const k = this.assertKey(it.key, lang);
      const existing = rows.get(k) ?? null;
      if (!existing && it.value === undefined) throw new BadRequestException(`${k} : ${this.t('value_required', lang)}`);
      const c = catalogEntry(k);
      const isSecret = it.isSecret ?? existing?.isSecret ?? c.secret;
      const oldPlain = existing ? this.safePlain(existing) : null;
      const plain = it.value !== undefined ? this.normalize(k, it.value, lang) : oldPlain ?? '';
      const row = existing ?? this.settings.create({ settingKey: k });
      const oldStored = existing?.value ?? null;
      row.value = this.store(plain, isSecret, lang);
      row.isSecret = isSecret;
      row.isActive = it.isActive ?? existing?.isActive ?? true;
      row.category = (it.category && SETTING_CATEGORIES[it.category] ? it.category : existing?.category) || c.category;
      if (it.description !== undefined) row.description = it.description || null;
      row.updatedById = user?.id ?? null;
      row.updatedByName = this.actorName(user);
      const oldForHistory = oldStored !== null && isSecret && !existing?.isSecret ? this.store(oldStored, true, lang) : oldStored;
      prepared.push({
        key: k,
        row,
        plain,
        hist: this.historyRow(k, existing ? SettingHistoryAction.UPDATE : SettingHistoryAction.CREATE, isSecret, oldForHistory, row.value, user, it.note ?? dto.note),
      });
    }

    const saved = await this.dataSource.transaction(async (m) => {
      const out: SystemSetting[] = [];
      for (const p of prepared) {
        out.push(await m.save(SystemSetting, p.row));
        await m.save(SystemSettingHistory, p.hist);
      }
      return out;
    });
    for (const p of prepared) applySettingToEnv(p.key, p.row.isActive ? p.plain : null);
    runtimeSettings().signature = null;
    this.audit?.annotate({ entity: 'system_settings', metadata: { keys: prepared.map((p) => p.key) } });

    const restart = prepared.filter((p) => catalogEntry(p.key).restart).map((p) => p.key);
    return {
      message: this.t('bulk_saved', lang, { count: saved.length }),
      data: { items: saved.map((s) => this.view(s.settingKey, s)), requiresRestart: restart },
    };
  }

  async setActive(key: string, isActive: boolean, user: Actor, lang = 'fr') {
    const k = this.assertKey(key, lang);
    const existing = await this.settings.findOne({ where: { settingKey: k } });
    if (!existing) throw new NotFoundException(this.t('not_found', lang, { key: k }));
    if (existing.isActive === isActive) {
      return { message: this.t(isActive ? 'enabled' : 'disabled', lang, { key: k }), data: this.view(k, existing) };
    }
    const res = await this.upsert(k, { isActive }, user, lang, isActive ? SettingHistoryAction.ENABLE : SettingHistoryAction.DISABLE);
    return { ...res, message: this.t(isActive ? 'enabled' : 'disabled', lang, { key: k }) };
  }

  /** Supprime la ligne : la valeur du .env redevient la valeur utilisée */
  async remove(key: string, user: Actor, lang = 'fr', note?: string) {
    const k = this.assertKey(key, lang);
    const existing = await this.settings.findOne({ where: { settingKey: k } });
    if (!existing) throw new NotFoundException(this.t('not_found', lang, { key: k }));
    await this.dataSource.transaction(async (m) => {
      await m.delete(SystemSetting, { settingKey: k });
      await m.save(SystemSettingHistory, this.historyRow(k, SettingHistoryAction.DELETE, existing.isSecret, existing.value, null, user, note));
    });
    applySettingToEnv(k, null);
    runtimeSettings().signature = null;
    this.audit?.annotate({ entity: 'system_settings', entityId: k, metadata: { key: k } });
    return { message: this.t('deleted', lang, { key: k }), data: this.view(k, null) };
  }

  /** Remet la valeur d'avant une modification de l'historique */
  async rollback(historyId: string, user: Actor, lang = 'fr') {
    const h = await this.history.findOne({ where: { id: historyId } });
    if (!h) throw new NotFoundException(this.t('history_not_found', lang));
    const k = this.assertKey(h.settingKey, lang);
    const note = `Retour à la valeur du ${new Date(h.createdAt).toISOString().slice(0, 16).replace('T', ' ')}`;
    if (h.oldValue === null || h.oldValue === undefined) {
      // Modification = création : on supprime la ligne (retour au .env)
      const exists = await this.settings.findOne({ where: { settingKey: k } });
      if (!exists) return { message: this.t('rolled_back', lang, { key: k }), data: this.view(k, null) };
      const res = await this.remove(k, user, lang, note);
      return { ...res, message: this.t('rolled_back', lang, { key: k }) };
    }
    let old: string;
    try {
      old = h.isSecret ? decryptSettingValue(h.oldValue) : h.oldValue;
    } catch {
      throw new BadRequestException(this.t('decrypt_failed', lang, { key: k }));
    }
    const res = await this.upsert(k, { value: old, isSecret: h.isSecret, isActive: true, note }, user, lang, SettingHistoryAction.ROLLBACK);
    return { ...res, message: this.t('rolled_back', lang, { key: k }) };
  }

  // ============================================================
  // IMPORT / EXPORT
  // ============================================================
  envFilePath(): string {
    const p = process.env.SETTINGS_ENV_FILE?.trim();
    return p ? path.resolve(p) : path.join(process.cwd(), '.env');
  }

  /**
   * Importe des clés au format .env :
   *  - source ENV_FILE : le fichier .env du serveur (valeurs actuelles de l'API)
   *  - source TEXT     : contenu collé dans l'administration
   * dryRun = aperçu (aucune valeur renvoyée), overwrite = remplacer les clés déjà en base.
   */
  async importEnv(dto: ImportSystemSettingsDto, user: Actor, lang = 'fr') {
    const source = dto.source ?? 'ENV_FILE';
    let parsed: Record<string, string>;
    if (source === 'TEXT') {
      if (!dto.content?.trim()) throw new BadRequestException(this.t('import_empty', lang));
      parsed = dotenv.parse(dto.content);
    } else {
      const file = this.envFilePath();
      if (!fs.existsSync(file)) throw new BadRequestException(this.t('env_file_missing', lang, { path: file }));
      parsed = dotenv.parse(fs.readFileSync(file));
    }

    const only = dto.keys?.length ? new Set(dto.keys) : null;
    const rows = await this.rowsMap();
    const plan = { create: [] as string[], update: [] as string[], same: [] as string[], exists: [] as string[], protected: [] as string[], invalid: [] as string[] };
    const work: { key: string; value: string; existing: SystemSetting | null }[] = [];

    for (const [rawKey, rawValue] of Object.entries(parsed)) {
      const key = rawKey.trim();
      if (only && !only.has(key)) continue;
      if (!SETTING_KEY_REGEX.test(key) || SYSTEM_ENV_KEYS.has(key) || key.startsWith('npm_')) {
        plan.invalid.push(key);
        continue;
      }
      if (PROTECTED_SETTING_KEYS.has(key)) {
        plan.protected.push(key);
        continue;
      }
      if (dto.onlyCatalog && !SETTINGS_CATALOG[key]) {
        plan.invalid.push(key);
        continue;
      }
      const value = String(rawValue ?? '');
      if (value.length > MAX_VALUE) {
        plan.invalid.push(key);
        continue;
      }
      const existing = rows.get(key) ?? null;
      if (existing) {
        const cur = this.safePlain(existing);
        if (cur === value) {
          plan.same.push(key);
          continue;
        }
        if (!dto.overwrite) {
          plan.exists.push(key);
          continue;
        }
        plan.update.push(key);
      } else {
        plan.create.push(key);
      }
      work.push({ key, value, existing });
    }

    const secrets = work.filter((w) => (w.existing?.isSecret ?? catalogEntry(w.key).secret)).map((w) => w.key);
    if (secrets.length && !settingsEncryptionAvailable()) throw new BadRequestException(this.t('no_encryption_key', lang));
    const skipped = plan.same.length + plan.exists.length + plan.protected.length + plan.invalid.length;
    const counts = { create: plan.create.length, update: plan.update.length, skip: skipped };

    if (dto.dryRun) {
      return { message: this.t('import_preview', lang, counts), data: { dryRun: true, source, ...plan, secrets } };
    }
    if (!work.length) return { message: this.t('imported', lang, counts), data: { dryRun: false, source, ...plan, secrets } };

    const note = dto.note ?? (source === 'TEXT' ? 'Import (texte .env)' : `Import du fichier ${path.basename(this.envFilePath())}`);
    await this.dataSource.transaction(async (m) => {
      for (const w of work) {
        const c = catalogEntry(w.key);
        const isSecret = w.existing?.isSecret ?? c.secret;
        const row = w.existing ?? this.settings.create({ settingKey: w.key, category: c.category, isActive: true });
        const oldStored = w.existing?.value ?? null;
        row.value = this.store(w.value, isSecret, lang);
        row.isSecret = isSecret;
        if (!w.existing) row.isActive = true;
        row.category = row.category || c.category;
        row.updatedById = user?.id ?? null;
        row.updatedByName = this.actorName(user);
        await m.save(SystemSetting, row);
        await m.save(SystemSettingHistory, this.historyRow(w.key, SettingHistoryAction.IMPORT, isSecret, oldStored, row.value, user, note));
      }
    });
    for (const w of work) {
      const active = w.existing ? w.existing.isActive : true;
      if (active) applySettingToEnv(w.key, w.value);
    }
    runtimeSettings().signature = null;
    this.audit?.annotate({ entity: 'system_settings', metadata: { import: source, created: plan.create.length, updated: plan.update.length } });

    return {
      message: this.t('imported', lang, counts),
      data: {
        dryRun: false,
        source,
        ...plan,
        secrets,
        requiresRestart: work.filter((w) => catalogEntry(w.key).restart).map((w) => w.key),
      },
    };
  }

  /** Contenu .env (secrets masqués sauf includeSecrets) */
  async exportEnv(q: ExportSystemSettingsQueryDto, user: Actor) {
    const role = String(Array.isArray(user?.role) ? user.role[0] : user?.role ?? '').toUpperCase();
    if (q.includeSecrets && role !== 'SUPER ADMIN') throw new ForbiddenException(this.t('forbidden'));
    const rows = await this.rowsMap();
    const keys = q.effective
      ? [...new Set([...Object.keys(SETTINGS_CATALOG), ...rows.keys()])].filter((k) => !PROTECTED_SETTING_KEYS.has(k) && process.env[k] !== undefined)
      : [...rows.keys()];

    const quote = (v: string) => {
      if (v === '') return '';
      if (/[\s#"'\\]/.test(v) || v.includes('\n')) return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
      return v;
    };
    const byCat = new Map<string, string[]>();
    for (const k of keys.sort()) {
      const row = rows.get(k);
      const c = catalogEntry(k);
      const isSecret = row ? row.isSecret : c.secret;
      const value = q.effective ? process.env[k] ?? '' : row ? this.safePlain(row) ?? '' : '';
      const cat = row?.category || c.category;
      const lines = byCat.get(cat) ?? [];
      if (row && !row.isActive) lines.push(`# (désactivé : valeur du .env utilisée)`);
      if (isSecret && !q.includeSecrets) lines.push(`${k}=  # secret masqué`);
      else lines.push(`${k}=${quote(value)}`);
      byCat.set(cat, lines);
    }
    const parts = [`# Paramètres Favor Help — export du ${new Date().toISOString()}`, ''];
    for (const [cat, lines] of byCat) {
      parts.push(`# ===== ${SETTING_CATEGORIES[cat] ?? cat} =====`, ...lines, '');
    }
    this.audit?.annotate({ entity: 'system_settings', metadata: { export: true, includeSecrets: !!q.includeSecrets, count: keys.length } });
    return { fileName: `parametres_${new Date().toISOString().slice(0, 10)}.env`, content: parts.join('\n') };
  }

  /** Recharge maintenant (cette instance) */
  async reload(lang = 'fr') {
    const res = await this.sync(true);
    return { message: this.t('reloaded', lang, { count: runtimeSettings().applied.size }), data: res };
  }
}
