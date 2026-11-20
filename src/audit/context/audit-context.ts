import { AsyncLocalStorage } from 'async_hooks';

/** Une modification réelle en base, captée pendant la requête (abonné TypeORM) */
export type AuditChange = {
  table: string;
  id: string | null;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  changes?: Record<string, [any, any]>;
};

/** ✅ Contexte d'audit d'une requête (AsyncLocalStorage) : rempli au fil de la requête, écrit à la fin */
export type AuditStore = {
  requestId: string;
  startedAt: number;
  /** @AuditAction de la route */
  meta?: { action: string; entity: string; category?: string; severity?: string; skipResponse?: boolean } | null;
  skip?: boolean;
  /** Chemin du contrôleur (ex. service-client/tickets) */
  controllerPath?: string | null;
  handlerName?: string | null;
  /** Paramètres et motif de la route (capturés par l'intercepteur) */
  params?: Record<string, any> | null;
  routePath?: string | null;
  response?: any;
  error?: { status?: number; code?: string; message?: string } | null;
  changes: AuditChange[];
  /** Ajouts libres (AuditService.annotate) : oldValue, metadata, entityId… */
  extra?: Record<string, any>;
  /** déjà écrit (évite les doublons) */
  written?: boolean;
  /** ✅ Appareil / réseau du client (rempli par AuditContextMiddleware, utilisé par les sessions) */
  client?: ClientInfo;
  /** Session de connexion du jeton reçu (rempli par CurrentUserMiddleware) */
  sessionId?: string | null;
  /** Sessions attribuées pendant la requête (même session pour access + refresh token) */
  sessionIssue?: Map<string, Promise<string | null>>;
};

export type ClientInfo = {
  ip: string | null;
  userAgent: string | null;
  platform: string | null;
  deviceId: string | null;
  deviceName: string | null;
  appVersion: string | null;
  path: string;
};

/** Plateforme : en-tête x-platform, sinon déduite de l'agent utilisateur */
export function detectPlatform(headers: Record<string, any>): string | null {
  const p = String(headers['x-platform'] ?? '').trim().toLowerCase();
  if (p) return p.slice(0, 20);
  const ua = String(headers['user-agent'] ?? '');
  if (/okhttp|android/i.test(ua)) return 'android';
  if (/cfnetwork|darwin|iphone|ipad/i.test(ua)) return 'ios';
  if (/dart/i.test(ua)) return 'mobile';
  if (/mozilla/i.test(ua)) return 'web';
  return null;
}

/** Nom lisible de l'appareil : « Chrome sur Windows », « Application Android »… */
export function describeDevice(userAgent?: string | null): string | null {
  const ua = String(userAgent ?? '');
  if (!ua) return null;
  if (/okhttp/i.test(ua)) return 'Application Android';
  if (/cfnetwork|darwin/i.test(ua)) return 'Application iOS';
  if (/dart/i.test(ua)) return 'Application mobile';
  const os = /windows/i.test(ua)
    ? 'Windows'
    : /iphone|ipad/i.test(ua)
      ? 'iOS'
      : /android/i.test(ua)
        ? 'Android'
        : /mac os|macintosh/i.test(ua)
          ? 'macOS'
          : /linux/i.test(ua)
            ? 'Linux'
            : null;
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /opr\/|opera/i.test(ua)
      ? 'Opera'
      : /firefox\//i.test(ua)
        ? 'Firefox'
        : /chrome\//i.test(ua)
          ? 'Chrome'
          : /safari\//i.test(ua)
            ? 'Safari'
            : /postman/i.test(ua)
              ? 'Postman'
              : null;
  if (browser && os) return `${browser} sur ${os}`;
  return (browser || os || ua.split(/[\s/]/)[0] || '').slice(0, 150) || null;
}

export const auditStorage = new AsyncLocalStorage<AuditStore>();

export function currentAudit(): AuditStore | undefined {
  return auditStorage.getStore();
}
