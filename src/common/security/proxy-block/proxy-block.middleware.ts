import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { IpReputationService } from './ip-reputation.service';

const MESSAGES: Record<string, string> = {
  fr: "L'accès via un VPN, un proxy ou Tor n'est pas autorisé. Désactivez-le puis réessayez.",
  en: 'Access through a VPN, proxy or Tor is not allowed. Please disable it and try again.',
  es: 'No se permite el acceso a través de una VPN, un proxy o Tor. Desactívelo e inténtelo de nuevo.',
  sw: 'Kuingia kupitia VPN, proxy au Tor hakuruhusiwi. Tafadhali izime kisha ujaribu tena.',
  ar: 'لا يُسمح بالدخول عبر VPN أو بروكسي أو Tor. يرجى إيقافه ثم المحاولة مرة أخرى.',
};

/**
 * ✅ Refuse les visiteurs qui passent par un VPN, un proxy public ou Tor.
 *
 *  PROXY_BLOCK_MODE :
 *    log   (défaut) → rien n'est bloqué, les IP détectées sont seulement écrites dans les journaux ;
 *    block          → réponse 403 ;
 *    off            → filtre désactivé.
 *  PROXY_BLOCK_EXCLUDE_PATHS : routes jamais filtrées (débuts d'URL, séparés par des virgules),
 *    ex. /api/v1/fpay/callback,/api/v1/health
 */
@Injectable()
export class ProxyBlockMiddleware implements NestMiddleware {
  private readonly logger = new Logger('ProxyBlock');

  constructor(private readonly reputation: IpReputationService) { }

  private get excluded(): string[] {
    return String(process.env.PROXY_BLOCK_EXCLUDE_PATHS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private lang(req: any): string {
    const raw = String(req.headers?.['x-lang'] ?? req.headers?.['accept-language'] ?? req.query?.lang ?? 'fr')
      .slice(0, 2)
      .toLowerCase();
    return MESSAGES[raw] ? raw : 'fr';
  }

  async use(req: any, res: any, next: (err?: any) => void) {
    const mode = this.reputation.mode;
    if (mode === 'off' || req.method === 'OPTIONS') return next();

    const url: string = req.originalUrl || req.url || '';
    if (this.excluded.some((p) => url.startsWith(p))) return next();

    let verdict;
    try {
      const ip = this.reputation.getClientIp(req);
      verdict = await this.reputation.check(ip);
    } catch (e: any) {
      // Jamais de blocage sur une erreur interne
      this.logger.warn(`Filtre VPN : erreur ${e?.message} → laissé passer`);
      return next();
    }

    if (!verdict.blocked) return next();

    if (mode === 'log') {
      this.logger.warn(`[OBSERVATION] ${verdict.type} détecté ip=${verdict.ip} ${req.method} ${url} (non bloqué)`);
      return next();
    }

    this.logger.warn(`⛔ ${verdict.type} bloqué ip=${verdict.ip} ${req.method} ${url}`);
    const lang = this.lang(req);
    res.status(403).json({
      statusCode: 403,
      error: 'Forbidden',
      code: 'PROXY_NOT_ALLOWED',
      message: MESSAGES[lang],
    });
  }
}
