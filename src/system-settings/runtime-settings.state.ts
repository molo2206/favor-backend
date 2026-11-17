// src/system-settings/runtime-settings.state.ts
import { PROTECTED_SETTING_KEYS } from './settings.catalog';

/**
 * ✅ État partagé des paramètres appliqués à process.env (même objet pour le préchargement et le service).
 *  - baseline : valeurs du .env / de l'environnement AVANT application de la base
 *  - applied  : clés actuellement remplacées par la base (clé → valeur appliquée)
 */
export type RuntimeSettingsState = {
  baseline: Record<string, string | undefined>;
  applied: Map<string, string>;
  bootAt: Date;
  preload: { loadedAt: Date | null; count: number; error: string | null; skipped: boolean };
  lastSyncAt: Date | null;
  signature: string | null;
};

const G = globalThis as any;

export function runtimeSettings(): RuntimeSettingsState {
  if (!G.__FAVOR_RUNTIME_SETTINGS__) {
    G.__FAVOR_RUNTIME_SETTINGS__ = {
      baseline: { ...process.env },
      applied: new Map<string, string>(),
      bootAt: new Date(),
      preload: { loadedAt: null, count: 0, error: null, skipped: true },
      lastSyncAt: null,
      signature: null,
    } as RuntimeSettingsState;
  }
  return G.__FAVOR_RUNTIME_SETTINGS__;
}

/** Valeur du .env (avant la base) */
export function baselineValue(key: string): string | undefined {
  return runtimeSettings().baseline[key];
}

/**
 * Applique une valeur de la base à process.env (null = revenir à la valeur du .env).
 * Les clés protégées ne sont jamais modifiées.
 */
export function applySettingToEnv(key: string, value: string | null): void {
  if (PROTECTED_SETTING_KEYS.has(key)) return;
  const state = runtimeSettings();
  if (value === null) {
    const base = state.baseline[key];
    if (base === undefined) delete process.env[key];
    else process.env[key] = base;
    state.applied.delete(key);
    return;
  }
  process.env[key] = value;
  state.applied.set(key, value);
}

export function settingsEnabled(): boolean {
  return String(process.env.SETTINGS_ENABLED ?? 'true').toLowerCase() !== 'false';
}
