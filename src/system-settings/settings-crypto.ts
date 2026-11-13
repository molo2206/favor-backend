// src/system-settings/settings-crypto.ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * ✅ Chiffrement des paramètres secrets (AES-256-GCM).
 * Clé : SETTINGS_ENCRYPTION_KEY (recommandé) ou, à défaut, BACKUP_ENCRYPTION_KEY.
 * Ces deux clés restent TOUJOURS dans le .env (jamais en base).
 * Changer la clé rend les secrets déjà enregistrés illisibles (il faudra les ressaisir).
 */
const PREFIX = 'sv1';

function secret(): string {
  return String(process.env.SETTINGS_ENCRYPTION_KEY || process.env.BACKUP_ENCRYPTION_KEY || '').trim();
}

export function settingsEncryptionAvailable(): boolean {
  return secret().length >= 16;
}

function key(): Buffer {
  const s = secret();
  if (s.length < 16) throw new Error('SETTINGS_ENCRYPTION_KEY (ou BACKUP_ENCRYPTION_KEY) manquante dans le .env');
  return createHash('sha256').update(`favor-settings:${s}`).digest();
}

export function isEncryptedSettingValue(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.startsWith(`${PREFIX}:`);
}

export function encryptSettingValue(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(plain ?? ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

/** Valeur en clair (une valeur non chiffrée est renvoyée telle quelle) */
export function decryptSettingValue(enc: string | null | undefined): string {
  if (enc === null || enc === undefined) return '';
  if (!isEncryptedSettingValue(enc)) return enc;
  const [, iv, tag, data] = enc.split(':');
  if (!iv || !tag || data === undefined) throw new Error('Format de valeur chiffrée inconnu');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

/** « ••••••••3f9a » : jamais la valeur complète d'un secret dans une réponse */
export function maskSecret(v: string | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return v === '' ? '' : null;
  const s = String(v);
  return s.length >= 12 ? `••••••••${s.slice(-4)}` : '••••••••';
}
