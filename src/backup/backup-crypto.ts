// src/backup/backup-crypto.ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * ✅ Chiffrement des mots de passe MySQL des bases à sauvegarder (AES-256-GCM).
 * Clé : BACKUP_ENCRYPTION_KEY (recommandé) ; à défaut, dérivée de ACCESS_TOKEN_SECRET_KEY.
 * Changer la clé rend les mots de passe déjà enregistrés illisibles (il faudra les ressaisir).
 */
function key(): Buffer {
  const secret = process.env.BACKUP_ENCRYPTION_KEY || process.env.ACCESS_TOKEN_SECRET_KEY || '';
  if (!secret) throw new Error('BACKUP_ENCRYPTION_KEY manquante dans le .env');
  return createHash('sha256').update(`favor-backup:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

export function decryptSecret(enc: string | null | undefined): string {
  if (!enc) return '';
  const [v, iv, tag, data] = enc.split(':');
  if (v !== 'v1' || !iv || !tag || data === undefined) throw new Error('Format de mot de passe chiffré inconnu');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
