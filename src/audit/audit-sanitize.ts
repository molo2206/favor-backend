/**
 * ✅ Masquage des données sensibles + limite de taille avant écriture dans audit_logs.
 */
const SENSITIVE = new Set(
  [
    'password', 'newpassword', 'oldpassword', 'currentpassword', 'confirmpassword', 'passwordconfirmation', 'hashedpassword',
    'token', 'accesstoken', 'access_token', 'refreshtoken', 'refresh_token', 'idtoken', 'id_token', 'identitytoken',
    'authorization', 'cookie', 'secret', 'clientsecret', 'apikey', 'api_key', 'privatekey', 'private_key',
    'otp', 'otpcode', 'otp_code', 'pin', 'pincode', 'cvv', 'cvc', 'cardnumber', 'card_number',
    'twofactorsecret', 'twofactorauthenticationsecret', 'secret2fa', 'fcmtoken', 'voiptoken', 'devicetoken',
    'resettoken', 'verificationcode', 'signaturekey',
  ].map((k) => k.toLowerCase()),
);

export const MASK = '***';

function isSensitive(key: string): boolean {
  const k = key.toLowerCase();
  if (SENSITIVE.has(k)) return true;
  return /password|secret|token$|apikey|privatekey/.test(k);
}

/** Copie masquée (profondeur limitée, tableaux tronqués) */
export function sanitize(value: any, depth = 0, seen = new WeakSet()): any {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return typeof value === 'string' && value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[buffer ${value.length} o]`;
  if (seen.has(value)) return '[circular]';
  if (depth > 6) return '[…]';
  seen.add(value);
  if (Array.isArray(value)) {
    const out = value.slice(0, 50).map((v) => sanitize(v, depth + 1, seen));
    if (value.length > 50) out.push(`[+${value.length - 50} éléments]`);
    return out;
  }
  // Fichiers multer : seulement le nom / type / taille
  if (typeof value.originalname === 'string' && (value.buffer || value.path)) {
    return { file: value.originalname, mimetype: value.mimetype, size: value.size };
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'function') continue;
    out[k] = isSensitive(k) && v !== null && v !== undefined && v !== '' ? MASK : sanitize(v, depth + 1, seen);
  }
  return out;
}

/** Limite la taille d'une valeur JSON (AUDIT_MAX_JSON_KB, 32 Ko par défaut) */
export function limitSize(value: any): any {
  if (value === null || value === undefined) return value;
  const maxBytes = Math.max(2, Number(process.env.AUDIT_MAX_JSON_KB || 32)) * 1024;
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    return { _unserializable: true };
  }
  if (json === undefined) return null;
  if (Buffer.byteLength(json, 'utf8') <= maxBytes) return value;
  return { _truncated: true, size: Buffer.byteLength(json, 'utf8'), preview: json.slice(0, Math.floor(maxBytes / 2)) };
}

export function clean(value: any): any {
  return limitSize(sanitize(value));
}

/** Résumé d'une réponse : listes → nombre d'éléments, objets → copie masquée */
export function summarizeResponse(resp: any): any {
  if (resp === null || resp === undefined) return null;
  const data = resp?.data !== undefined ? resp.data : resp;
  if (Array.isArray(data)) return { count: data.length };
  if (data && Array.isArray(data.data) && typeof data.total === 'number') {
    return { count: data.data.length, total: data.total, page: data.page, limit: data.limit };
  }
  if (Buffer.isBuffer(data)) return { file: true, size: data.length };
  return clean(data);
}

/** Identifiant de l'enregistrement concerné, d'après la réponse */
export function idFrom(resp: any): string | null {
  const data = resp?.data !== undefined ? resp.data : resp;
  const id = data?.id ?? data?.data?.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

/** Utilisateur dans la réponse d'une connexion (premier objet avec id + email / téléphone / nom) */
export function userFromResponse(resp: any, depth = 0): { id: string; fullName?: string; role?: string } | null {
  if (!resp || typeof resp !== 'object' || depth > 4) return null;
  if (typeof resp.id === 'string' && (resp.email !== undefined || resp.phone !== undefined || resp.fullName !== undefined)) {
    return { id: resp.id, fullName: resp.fullName, role: Array.isArray(resp.role) ? resp.role[0] : resp.role };
  }
  for (const k of ['user', 'data', 'result']) {
    const found = userFromResponse(resp[k], depth + 1);
    if (found) return found;
  }
  return null;
}
