// src/storage-admin/storage-roots.ts
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { getMediaBaseUrl } from 'src/files/media-url.util';

/**
 * ✅ Dossiers du serveur accessibles depuis le gestionnaire de fichiers.
 *  - storage : UPLOAD_PATH (fichiers publics du domaine média) — lecture / écriture
 *  - legacy  : <projet>/uploads (anciens fichiers servis par l'API) — lecture / écriture
 *  - hr      : HR_DOCUMENTS_PATH (dossiers RH privés) — lecture seule (gérés par le module RH)
 *  - backups : BACKUP_DIR — lecture seule (gérés par le module sauvegardes)
 *  - FILE_MANAGER_EXTRA_ROOTS="nom:/chemin:rw,autre:/chemin:ro" pour en ajouter
 * Aucun accès en dehors de ces dossiers (chemins « .. », liens symboliques sortants refusés).
 */
export type StorageRoot = {
  id: string;
  label: string;
  path: string;
  writable: boolean;
  /** Fichiers servis publiquement (URL calculée) */
  publicBase: string | null;
};

const SYSTEM_DIRS = ['/', '/etc', '/root', '/bin', '/sbin', '/usr', '/boot', '/proc', '/sys', '/dev', '/var', '/home', '/lib', '/lib64'];

function trimSlash(s: string) {
  return s.replace(/\/+$/, '');
}

export function uploadRoot(): string {
  return path.resolve(process.env.UPLOAD_PATH || process.env.UPLOAD_PATH_PROD || '/var/www/favor-storage');
}

export function trashRoot(): string {
  return path.resolve(process.env.FILE_TRASH_PATH || '/var/www/favor-private/trash');
}

export function storageRoots(): StorageRoot[] {
  const out: StorageRoot[] = [];
  const add = (r: StorageRoot) => {
    const p = path.resolve(r.path);
    if (SYSTEM_DIRS.includes(p) || out.some((o) => o.id === r.id || o.path === p)) return;
    out.push({ ...r, path: p });
  };
  const media = getMediaBaseUrl();
  const api = trimSlash(process.env.BASE_URL || process.env.BASE_URL_PROD || '');
  add({ id: 'storage', label: 'Fichiers (domaine média)', path: uploadRoot(), writable: true, publicBase: media || (api ? `${api}/uploads` : null) });
  add({ id: 'legacy', label: 'Anciens fichiers de l\'API (uploads)', path: path.join(process.cwd(), 'uploads'), writable: true, publicBase: api ? `${api}/uploads` : null });
  if (process.env.HR_DOCUMENTS_PATH || fs.existsSync('/var/www/favor-private/hr-documents')) {
    add({ id: 'hr', label: 'Dossiers RH (privé)', path: process.env.HR_DOCUMENTS_PATH || '/var/www/favor-private/hr-documents', writable: false, publicBase: null });
  }
  add({ id: 'backups', label: 'Sauvegardes', path: process.env.BACKUP_DIR?.trim() || path.join(process.cwd(), 'backups'), writable: false, publicBase: null });
  for (const raw of String(process.env.FILE_MANAGER_EXTRA_ROOTS || '').split(',')) {
    const m = raw.trim().match(/^([a-z0-9_-]{2,30}):(\/[^:]+)(?::(rw|ro))?$/i);
    if (m) add({ id: m[1].toLowerCase(), label: m[1], path: m[2], writable: (m[3] || 'ro').toLowerCase() === 'rw', publicBase: null });
  }
  return out;
}

export function getRoot(id: string | undefined): StorageRoot {
  const r = storageRoots().find((x) => x.id === String(id || 'storage').toLowerCase());
  if (!r) throw new NotFoundException('Dossier racine inconnu');
  return r;
}

/** Normalise un chemin relatif (« a/b/c.jpg ») et refuse toute sortie de la racine */
export function cleanRelative(rel: string | undefined | null): string {
  const s = String(rel ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p && p !== '.')
    .join('/');
  if (s.split('/').some((p) => p === '..')) throw new BadRequestException('Chemin invalide');
  if (/[\0]/.test(s)) throw new BadRequestException('Chemin invalide');
  return s;
}

/** Chemin absolu sûr dans la racine (le fichier peut ne pas exister) */
export function resolveIn(root: StorageRoot, rel: string | undefined | null): { abs: string; rel: string } {
  const r = cleanRelative(rel);
  const abs = path.resolve(root.path, r);
  if (abs !== root.path && !abs.startsWith(root.path + path.sep)) throw new BadRequestException('Chemin invalide');
  // Liens symboliques : la cible réelle doit rester dans la racine
  try {
    const real = fs.realpathSync(abs);
    const realRoot = fs.realpathSync(root.path);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new ForbiddenException('Lien vers un dossier non autorisé');
  } catch (e: any) {
    if (e instanceof ForbiddenException) throw e;
  }
  return { abs, rel: r };
}

export function assertWritable(root: StorageRoot) {
  if (!root.writable) throw new ForbiddenException(`« ${root.label} » est en lecture seule`);
}

/** Nom de fichier / dossier valide (pas de / ni de caractères de contrôle) */
export function safeName(name: string): string {
  const n = String(name ?? '').trim();
  if (!n || n === '.' || n === '..' || n.length > 200 || /[\/\\\0<>:"|?*\x00-\x1f]/.test(n)) {
    throw new BadRequestException('Nom invalide (pas de / \\ : * ? " < > |)');
  }
  return n;
}

export function publicUrl(root: StorageRoot, rel: string): string | null {
  if (!root.publicBase) return null;
  if (root.id === 'legacy' && !rel.startsWith('users/')) return null;
  return `${trimSlash(root.publicBase)}/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo', m3u8: 'application/vnd.apple.mpegurl',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', wav: 'audio/wav', opus: 'audio/opus',
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', csv: 'text/csv', json: 'application/json', xml: 'application/xml', html: 'text/html',
  zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar', sql: 'application/sql', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
};

export function mimeOf(name: string): string {
  const ext = name.toLowerCase().split('.').pop() || '';
  return MIME[ext] || 'application/octet-stream';
}

export type FileKind = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';
export function kindOf(name: string): FileKind {
  const m = mimeOf(name);
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/') || m.includes('mpegurl')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (/pdf|word|excel|sheet|powerpoint|presentation|text\/|json|xml|sql/.test(m)) return 'document';
  if (/zip|gzip|tar|rar|7z/.test(m)) return 'archive';
  return 'other';
}

export function human(bytes: number): string {
  if (!bytes) return '0 o';
  const u = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}

/** Déplacement (même disque : rename ; autre disque : copie puis suppression) */
export async function moveAny(from: string, to: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  try {
    await fs.promises.rename(from, to);
  } catch (e: any) {
    if (e?.code !== 'EXDEV') throw e;
    await fs.promises.cp(from, to, { recursive: true, errorOnExist: true, force: false });
    await fs.promises.rm(from, { recursive: true, force: true });
  }
}

/** Nom libre dans un dossier : « photo.jpg » → « photo (1).jpg » */
export function freeName(dir: string, name: string): string {
  if (!fs.existsSync(path.join(dir, name))) return name;
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let i = 1; i < 10000; i++) {
    const n = `${base} (${i})${ext}`;
    if (!fs.existsSync(path.join(dir, n))) return n;
  }
  return `${base}_${Date.now()}${ext}`;
}
