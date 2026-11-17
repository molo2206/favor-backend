/**
 * ✅ Domaine média dédié (ex. https://media.favorhelp.com)
 *
 * Les fichiers (images, vidéos, documents) sont servis directement par le serveur web (Apache) sur le sous-domaine média :
 *   https://media.favorhelp.com/<dossier>/<fichier>   →   /var/www/favor-storage/<dossier>/<fichier>
 * L'URL de l'API n'apparaît donc plus dans les liens des fichiers.
 *
 * Variables .env :
 *   MEDIA_BASE_URL        URL publique du domaine média (vide = ancien comportement BASE_URL/uploads)
 *   MEDIA_LEGACY_ORIGINS  Anciennes origines dont les liens « <origine>/uploads/... » sont réécrits
 *                         dans les réponses (séparées par des virgules). BASE_URL est toujours incluse.
 */

const LEGACY_USERS_SEGMENT = 'users/'; // ancien dossier <projet>/uploads/users servi par l'API uniquement

const trimSlash = (v: string) => v.trim().replace(/\/+$/, '');
const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let cache: { key: string; media: string; legacy: string[]; regex: RegExp | null } | null = null;

function config() {
  const media = trimSlash(process.env.MEDIA_BASE_URL || '');
  const legacyRaw = [
    process.env.BASE_URL || '',
    process.env.BASE_URL_PROD || '',
    ...(process.env.MEDIA_LEGACY_ORIGINS || '').split(','),
  ];
  const key = `${media}|${legacyRaw.join(',')}`;
  if (cache && cache.key === key) return cache;

  const legacy = [...new Set(legacyRaw.map(trimSlash).filter((o) => !!o && o !== media))];
  // <origine>/uploads/  (sauf l'ancien dossier uploads/users qui n'existe que côté API)
  const regex =
    media && legacy.length
      ? new RegExp(
          `(?:${legacy.map(escapeRegex).join('|')})/uploads/(?!${escapeRegex(LEGACY_USERS_SEGMENT)})`,
          'g',
        )
      : null;
  cache = { key, media, legacy, regex };
  return cache;
}

/** URL publique du domaine média, sans « / » final ('' si non configurée). */
export function getMediaBaseUrl(): string {
  return config().media;
}

/** Construit l'URL publique d'un fichier stocké dans UPLOAD_PATH/<subFolder>/<name>. */
export function buildPublicFileUrl(fallbackApiBaseUrl: string, subFolder: string, name: string): string {
  const folder = subFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const media = getMediaBaseUrl();
  if (media) return `${media}/${folder}/${name}`;
  return `${trimSlash(fallbackApiBaseUrl)}/uploads/${folder}/${name}`;
}

/** Réécrit une chaîne contenant d'anciens liens « <api>/uploads/... » vers le domaine média. */
export function toMediaUrl(value: string): string {
  const { media, regex } = config();
  if (!regex || !value || value.indexOf('/uploads/') === -1) return value;
  regex.lastIndex = 0;
  return value.replace(regex, `${media}/`);
}

/** true si l'URL désigne un fichier stocké par l'API (ancien lien /uploads/ ou domaine média). */
export function isStoredFileUrl(url?: string | null): url is string {
  if (!url) return false;
  if (url.includes('/uploads/')) return true;
  const media = getMediaBaseUrl();
  return !!media && url.startsWith(`${media}/`);
}

/**
 * Chemin relatif dans UPLOAD_PATH (ex. « product/abc.webp ») à partir d'une URL publique,
 * ancienne (…/uploads/product/abc.webp) ou nouvelle (https://media…/product/abc.webp).
 * Retourne null si l'URL n'est pas un fichier stocké ou si le chemin est suspect.
 */
export function storedRelativePath(url?: string | null): string | null {
  if (!url) return null;
  const clean = url.split('?')[0].split('#')[0];
  let relative: string | null = null;
  const media = getMediaBaseUrl();
  const marker = '/uploads/';
  const idx = clean.indexOf(marker);
  if (media && clean.startsWith(`${media}/`)) relative = clean.slice(media.length + 1);
  else if (idx !== -1) relative = clean.slice(idx + marker.length);
  if (!relative) return null;
  try {
    relative = decodeURIComponent(relative);
  } catch {
    return null;
  }
  if (relative.includes('..') || relative.startsWith('/')) return null;
  return relative;
}

/**
 * Parcourt une réponse (objets, tableaux, entités) et réécrit les anciens liens de fichiers.
 * Modifie les chaînes en place ; ignore Date, Buffer, flux, Map/Set et références circulaires.
 */
export function rewriteMediaUrlsDeep<T>(value: T): T {
  const { regex } = config();
  if (!regex) return value;

  const seen = new WeakSet<object>();
  const walk = (v: any, depth: number): any => {
    if (typeof v === 'string') return toMediaUrl(v);
    if (!v || typeof v !== 'object' || depth > 25) return v;
    if (
      v instanceof Date ||
      Buffer.isBuffer(v) ||
      ArrayBuffer.isView(v) ||
      v instanceof Map ||
      v instanceof Set ||
      typeof v.pipe === 'function' ||
      typeof v.getStream === 'function'
    )
      return v;
    if (seen.has(v)) return v;
    seen.add(v);

    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) v[i] = walk(v[i], depth + 1);
      return v;
    }
    for (const k of Object.keys(v)) {
      const cur = v[k];
      if (cur === null || cur === undefined || typeof cur === 'number' || typeof cur === 'boolean') continue;
      const next = walk(cur, depth + 1);
      if (next !== cur) {
        try {
          v[k] = next;
        } catch {
          /* propriété en lecture seule */
        }
      }
    }
    return v;
  };
  return walk(value, 0);
}
