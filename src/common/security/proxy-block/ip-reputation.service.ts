import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { isIP } from 'net';

/** Verdict pour une IP */
export interface IpVerdict {
  ip: string;
  /** true = VPN / proxy / Tor (ou hébergeur si PROXY_BLOCK_DATACENTER=true) */
  blocked: boolean;
  /** VPN, PROXY, TOR, DATACENTER, CLEAN, PRIVATE, ALLOWLIST, UNKNOWN */
  type: string;
  provider: string;
  /** Vérification impossible (service indisponible, quota) → laissé passer */
  unknown?: boolean;
}

/**
 * ✅ Détection des VPN, proxys publics et Tor.
 *
 *  - Tor : liste officielle des sorties Tor, rechargée toutes les 6 h (gratuit, sans quota).
 *  - VPN / proxy : service de réputation d'IP (PROXY_CHECK_PROVIDER) :
 *      proxycheck (défaut) → https://proxycheck.io  (clé : PROXY_CHECK_API_KEY)
 *      ipapiis              → https://ipapi.is      (clé : PROXY_CHECK_API_KEY, facultative)
 *      none                 → Tor seulement
 *  - Chaque IP n'est vérifiée qu'une fois toutes les 24 h (cache mémoire) → peu d'appels au service.
 *  - Service indisponible / quota épuisé / délai dépassé → l'IP est LAISSÉE PASSER (jamais de blocage par erreur).
 */
@Injectable()
export class IpReputationService implements OnModuleInit {
  private readonly logger = new Logger('ProxyBlock');

  private torExits = new Set<string>();
  private torLoadedAt = 0;

  private readonly cache = new Map<string, { verdict: IpVerdict; at: number }>();
  private readonly inFlight = new Map<string, Promise<IpVerdict>>();
  private readonly MAX_CACHE = 50000;

  constructor(private readonly http: HttpService) { }

  // ------------------------------------------------------------
  // Réglages (.env)
  // ------------------------------------------------------------
  get mode(): 'off' | 'log' | 'block' {
    const m = String(process.env.PROXY_BLOCK_MODE ?? 'log').toLowerCase();
    return m === 'block' ? 'block' : m === 'off' ? 'off' : 'log';
  }

  private get provider(): string {
    return String(process.env.PROXY_CHECK_PROVIDER ?? 'proxycheck').toLowerCase();
  }

  private get blockDatacenter(): boolean {
    return String(process.env.PROXY_BLOCK_DATACENTER ?? 'false').toLowerCase() === 'true';
  }

  private get cacheMs(): number {
    return (Number(process.env.PROXY_CHECK_CACHE_HOURS) || 24) * 3600000;
  }

  private get timeoutMs(): number {
    return Number(process.env.PROXY_CHECK_TIMEOUT_MS) || 1500;
  }

  /** IP ou débuts d'IP toujours autorisés : PROXY_BLOCK_ALLOW_IPS=41.243.,197.157.1.10 */
  private get allowList(): string[] {
    return String(process.env.PROXY_BLOCK_ALLOW_IPS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async onModuleInit() {
    if (this.mode !== 'off') {
      this.refreshTorList().catch(() => undefined);
    }
  }

  // ------------------------------------------------------------
  // Vraie IP du visiteur (sans se laisser tromper par un faux en-tête)
  // ------------------------------------------------------------
  /**
   * Les en-têtes X-Real-IP / X-Forwarded-For ne sont crus QUE s'ils viennent de votre Nginx
   * (connexion depuis 127.0.0.1 / ::1, ou une IP de PROXY_TRUSTED_IPS).
   * Sinon un visiteur sous VPN pourrait envoyer « X-Forwarded-For: <une IP congolaise> ».
   * PROXY_TRUST_CLOUDFLARE=true : CF-Connecting-IP est utilisé (si le site passe par Cloudflare).
   */
  getClientIp(req: any): string {
    const socketIp = this.clean(req?.socket?.remoteAddress || req?.connection?.remoteAddress || '');
    const trusted = this.isTrustedProxy(socketIp);

    if (trusted) {
      if (String(process.env.PROXY_TRUST_CLOUDFLARE ?? 'false').toLowerCase() === 'true') {
        const cf = this.clean(String(req.headers?.['cf-connecting-ip'] ?? ''));
        if (isIP(cf)) return cf;
      }
      const real = this.clean(String(req.headers?.['x-real-ip'] ?? ''));
      if (isIP(real)) return real;

      // X-Forwarded-For : on part de la DROITE (ajoutée par votre Nginx), on saute les proxys de confiance
      const xff = String(req.headers?.['x-forwarded-for'] ?? '')
        .split(',')
        .map((s) => this.clean(s))
        .filter((s) => isIP(s));
      for (let i = xff.length - 1; i >= 0; i--) {
        if (!this.isTrustedProxy(xff[i])) return xff[i];
      }
    }
    return socketIp || '0.0.0.0';
  }

  private clean(ip: string): string {
    let v = String(ip ?? '').trim();
    if (v.startsWith('::ffff:')) v = v.substring(7);
    if (v === '::1') v = '127.0.0.1';
    return v;
  }

  private isTrustedProxy(ip: string): boolean {
    if (!ip) return false;
    if (ip === '127.0.0.1') return true;
    const extra = String(process.env.PROXY_TRUSTED_IPS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return extra.some((p) => ip === p || (p.endsWith('.') && ip.startsWith(p)));
  }

  private isPrivate(ip: string): boolean {
    return (
      ip === '0.0.0.0' ||
      ip.startsWith('127.') ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
      ip.startsWith('169.254.') ||
      ip.startsWith('100.64.') ||
      ip.startsWith('fc') ||
      ip.startsWith('fd') ||
      ip.startsWith('fe80:')
    );
  }

  // ------------------------------------------------------------
  // Vérification
  // ------------------------------------------------------------
  async check(ip: string): Promise<IpVerdict> {
    if (!isIP(ip) || this.isPrivate(ip)) {
      return { ip, blocked: false, type: 'PRIVATE', provider: 'local' };
    }
    if (this.allowList.some((p) => ip === p || (p.endsWith('.') || p.endsWith(':') ? ip.startsWith(p) : false))) {
      return { ip, blocked: false, type: 'ALLOWLIST', provider: 'local' };
    }

    // Tor (liste locale, rechargée en arrière-plan)
    if (Date.now() - this.torLoadedAt > 6 * 3600000) this.refreshTorList().catch(() => undefined);
    if (this.torExits.has(ip)) {
      return { ip, blocked: true, type: 'TOR', provider: 'torproject' };
    }

    const cached = this.cache.get(ip);
    if (cached && Date.now() - cached.at < (cached.verdict.unknown ? 10 * 60000 : this.cacheMs)) {
      return cached.verdict;
    }

    let pending = this.inFlight.get(ip);
    if (!pending) {
      pending = this.lookup(ip).finally(() => this.inFlight.delete(ip));
      this.inFlight.set(ip, pending);
    }
    const verdict = await pending;
    this.remember(ip, verdict);
    return verdict;
  }

  private remember(ip: string, verdict: IpVerdict) {
    if (this.cache.size >= this.MAX_CACHE) {
      // On retire les plus anciennes (ordre d'insertion de la Map)
      const it = this.cache.keys();
      for (let i = 0; i < 1000; i++) {
        const k = it.next();
        if (k.done) break;
        this.cache.delete(k.value);
      }
    }
    this.cache.delete(ip);
    this.cache.set(ip, { verdict, at: Date.now() });
  }

  private async lookup(ip: string): Promise<IpVerdict> {
    try {
      if (this.provider === 'proxycheck') return await this.lookupProxycheck(ip);
      if (this.provider === 'ipapiis') return await this.lookupIpapiIs(ip);
      return { ip, blocked: false, type: 'CLEAN', provider: 'none' };
    } catch (e: any) {
      this.logger.warn(`Vérification impossible pour ${ip} (${this.provider}) : ${e?.message} → laissé passer`);
      return { ip, blocked: false, type: 'UNKNOWN', provider: this.provider, unknown: true };
    }
  }

  /** proxycheck.io : { status: 'ok', '<ip>': { proxy: 'yes'|'no', type: 'VPN'|'SOCKS5'|'Compromised Server'|… } } */
  private async lookupProxycheck(ip: string): Promise<IpVerdict> {
    const key = process.env.PROXY_CHECK_API_KEY;
    const url =
      `https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=1&asn=1` + (key ? `&key=${encodeURIComponent(key)}` : '');
    const { data } = await firstValueFrom(this.http.get(url, { timeout: this.timeoutMs }));
    const status = String(data?.status ?? '').toLowerCase();
    if (status === 'denied' || status === 'error' || !data?.[ip]) {
      throw new Error(`proxycheck status=${data?.status} ${data?.message ?? ''}`.trim());
    }
    const info = data[ip];
    const isProxy = String(info.proxy ?? '').toLowerCase() === 'yes';
    const rawType = String(info.type ?? '').toUpperCase();
    const type = !isProxy ? 'CLEAN' : rawType.includes('VPN') ? 'VPN' : rawType.includes('TOR') ? 'TOR' : 'PROXY';
    return { ip, blocked: isProxy, type, provider: 'proxycheck' };
  }

  /** ipapi.is : { is_vpn, is_proxy, is_tor, is_datacenter, … } */
  private async lookupIpapiIs(ip: string): Promise<IpVerdict> {
    const key = process.env.PROXY_CHECK_API_KEY;
    const url = `https://api.ipapi.is/?q=${encodeURIComponent(ip)}` + (key ? `&key=${encodeURIComponent(key)}` : '');
    const { data } = await firstValueFrom(this.http.get(url, { timeout: this.timeoutMs }));
    if (!data || data.error) throw new Error(`ipapi.is : ${data?.error ?? 'réponse vide'}`);
    if (data.is_tor) return { ip, blocked: true, type: 'TOR', provider: 'ipapiis' };
    if (data.is_vpn) return { ip, blocked: true, type: 'VPN', provider: 'ipapiis' };
    if (data.is_proxy) return { ip, blocked: true, type: 'PROXY', provider: 'ipapiis' };
    if (data.is_datacenter && this.blockDatacenter) return { ip, blocked: true, type: 'DATACENTER', provider: 'ipapiis' };
    return { ip, blocked: false, type: data.is_datacenter ? 'DATACENTER' : 'CLEAN', provider: 'ipapiis' };
  }

  /** Liste officielle des sorties Tor */
  private async refreshTorList(): Promise<void> {
    if (String(process.env.PROXY_BLOCK_TOR ?? 'true').toLowerCase() === 'false') return;
    this.torLoadedAt = Date.now(); // évite les rechargements en rafale
    try {
      const { data } = await firstValueFrom(
        this.http.get('https://check.torproject.org/torbulkexitlist', { timeout: 10000, responseType: 'text' }),
      );
      const list = String(data ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => isIP(s));
      if (list.length > 100) {
        this.torExits = new Set(list);
        this.logger.log(`Liste Tor chargée : ${list.length} adresses`);
      }
    } catch (e: any) {
      this.logger.warn(`Liste Tor indisponible : ${e?.message}`);
    }
  }
}
