import { Injectable, Logger, NestMiddleware, Optional } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { IpReputationService } from 'src/common/security/proxy-block/ip-reputation.service';
import { auditStorage, AuditStore, describeDevice, detectPlatform } from './audit-context';
import { AuditService } from '../audit.service';

const SAFE_ID = /^[A-Za-z0-9._:-]{8,64}$/;

/**
 * ✅ Premier middleware de chaque requête :
 *  - identifiant de requête (x-request-id, renvoyé dans l'en-tête de réponse et repris par le filtre d'erreurs)
 *  - contexte d'audit (AsyncLocalStorage) rempli pendant la requête
 *  - écriture du journal quand la réponse est envoyée (succès, échec ou accès refusé)
 */
@Injectable()
export class AuditContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Performance');

  constructor(
    private readonly audit: AuditService,
    @Optional() private readonly ip?: IpReputationService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const incoming = String(req.headers['x-request-id'] ?? '');
    const requestId = SAFE_ID.test(incoming) ? incoming : randomUUID();
    req.headers['x-request-id'] = requestId;
    try {
      res.setHeader('x-request-id', requestId);
    } catch {
      /* en-têtes déjà envoyés */
    }

    const store: AuditStore = { requestId, startedAt: Date.now(), changes: [] };
    (req as any).auditIp = this.clientIp(req);
    const header = (name: string, max: number) => {
      const v = req.headers[name];
      const s = String(Array.isArray(v) ? v[0] : v ?? '').trim();
      return s ? s.slice(0, max) : null;
    };
    const userAgent = header('user-agent', 500);
    store.client = {
      ip: (req as any).auditIp ?? null,
      userAgent,
      platform: detectPlatform(req.headers),
      deviceId: header('x-device-id', 150),
      deviceName: header('x-device-name', 150) ?? describeDevice(userAgent),
      appVersion: header('x-app-version', 30),
      path: String(req.originalUrl || req.url || '').split('?')[0],
    };

    res.on('finish', () => {
      this.audit.fromRequest(req, res, store).catch(() => undefined);
      // ✅ Requêtes lentes signalées (SLOW_REQUEST_MS, 1500 ms par défaut ; 0 = désactivé)
      const slowMs = Number(process.env.SLOW_REQUEST_MS ?? 1500);
      const took = Date.now() - store.startedAt;
      if (slowMs > 0 && took >= slowMs) {
        this.logger.warn(`🐢 ${req.method} ${String(req.originalUrl || req.url).slice(0, 300)} → ${res.statusCode} en ${took} ms`);
      }
    });

    auditStorage.run(store, () => next());
  }

  private clientIp(req: Request): string | null {
    try {
      if (this.ip) return this.ip.getClientIp(req);
    } catch {
      /* repli */
    }
    return (req.socket?.remoteAddress || '').replace(/^::ffff:/, '') || null;
  }
}
