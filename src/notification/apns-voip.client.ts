import * as http2 from 'http2';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as nodePath from 'path';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface VoipSendResult {
  ok: boolean;
  status: number;
  reason?: string;
  /** Jeton à supprimer (désinstallé / invalide) */
  invalidToken?: boolean;
}

/**
 * ✅ Appels iOS « comme WhatsApp » : notification VoIP (PushKit) envoyée directement à Apple (APNs, HTTP/2).
 * L'app iOS reçoit le push même fermée et affiche l'écran d'appel natif (CallKit).
 * Firebase ne transporte pas les push VoIP : il faut ce canal séparé.
 *
 * Aucune dépendance npm : http2 + crypto de Node (jeton JWT ES256 avec la clé .p8 Apple).
 *
 * Variables .env :
 *   APNS_VOIP_ENABLED=true                 (défaut : actif si les clés ci-dessous sont présentes)
 *   APNS_TEAM_ID=XXXXXXXXXX                (Apple Developer → Membership)
 *   APNS_KEY_ID=YYYYYYYYYY                 (Keys → clé « Apple Push Notifications service »)
 *   APNS_VOIP_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"   ou APNS_VOIP_KEY_PATH=/chemin/AuthKey.p8
 *   APNS_VOIP_TOPIC=com.favorgroup.favordriver.voip   (bundle id de l'app + ".voip") — app par défaut
 *   APNS_VOIP_TOPICS=driver=com.favorgroup.favordriver.voip,ios=<bundle app livreur>.voip
 *                                          (✅ plusieurs applications iOS : sujet VoIP selon la plateforme de l'appareil)
 *   APNS_PRODUCTION=true                   (false = sandbox, pour les builds de développement)
 */
export class ApnsVoipClient {
  private static instance: ApnsVoipClient | null = null;
  private readonly logger = new Logger('ApnsVoip');
  /** Une connexion HTTP/2 par serveur Apple (production / sandbox) */
  private sessions = new Map<string, http2.ClientHttp2Session>();
  private jwt: { token: string; at: number } | null = null;
  private key: string | null = null;

  static shared(config: ConfigService): ApnsVoipClient {
    if (!ApnsVoipClient.instance) ApnsVoipClient.instance = new ApnsVoipClient(config);
    return ApnsVoipClient.instance;
  }

  private constructor(private readonly config: ConfigService) {
    if (this.enabled) {
      const extra = Object.entries(this.topics).map(([k, v]) => `${k}→${v}`).join(', ');
      this.logger.log(`VoIP iOS activé (${this.host}, topic ${this.topic || '—'}${extra ? ` ; ${extra}` : ''})`);
    }
  }

  private get teamId() {
    return this.config.get<string>('APNS_TEAM_ID') || '';
  }
  private get keyId() {
    return this.config.get<string>('APNS_KEY_ID') || '';
  }
  get topic() {
    return this.config.get<string>('APNS_VOIP_TOPIC') || '';
  }

  /** ✅ Sujets VoIP par plateforme d'appareil : APNS_VOIP_TOPICS=driver=com.x.driver.voip,ios=com.x.livreur.voip */
  private get topics(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of String(this.config.get<string>('APNS_VOIP_TOPICS') || '').split(',')) {
      const [k, v] = part.split('=').map((x) => x?.trim());
      if (k && v) out[k.toLowerCase()] = v;
    }
    return out;
  }

  /**
   * Sujet VoIP de l'application de cet appareil (bundle id + ".voip").
   * Un push VoIP envoyé avec le sujet d'une autre application est refusé par Apple (DeviceTokenNotForTopic).
   */
  topicFor(platform?: string | null): string {
    const p = String(platform || '').toLowerCase().trim();
    const map = this.topics;
    return (p && map[p]) || this.topic;
  }
  private get host() {
    const prod = String(this.config.get('APNS_PRODUCTION') ?? 'true').toLowerCase() !== 'false';
    return prod ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
  }

  /**
   * ✅ Chemin de la clé .p8 : absolu, ou relatif au dossier du projet
   * (ex. APNS_VOIP_KEY_PATH=certs/apns/AuthKey_R4X9PK3D54.p8 → <projet>/certs/apns/AuthKey_R4X9PK3D54.p8),
   * que le serveur soit lancé depuis le projet (npm run start:prod / pm2) ou depuis dist/.
   */
  private resolveKeyPath(p: string): string {
    if (nodePath.isAbsolute(p)) return p;
    const candidates = [
      nodePath.resolve(process.cwd(), p),
      nodePath.resolve(__dirname, '..', '..', p), // dist/notification → projet
      nodePath.resolve(__dirname, '..', '..', '..', p), // dist/src/notification → projet
    ];
    return candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
  }

  private privateKey(): string | null {
    if (this.key) return this.key;
    const inline = this.config.get<string>('APNS_VOIP_KEY');
    const path = this.config.get<string>('APNS_VOIP_KEY_PATH');
    try {
      if (inline) this.key = inline.replace(/\\n/g, '\n');
      else if (path) this.key = fs.readFileSync(this.resolveKeyPath(path), 'utf8');
    } catch (e: any) {
      this.logger.error(`Clé APNs VoIP illisible : ${e?.message}`);
    }
    return this.key;
  }

  /**
   * ✅ Actif dès que les clés Apple sont renseignées (APNS_VOIP_ENABLED=false pour couper).
   */
  get enabled(): boolean {
    return (
      String(this.config.get('APNS_VOIP_ENABLED') ?? 'true').toLowerCase() !== 'false' &&
      !!this.teamId &&
      !!this.keyId &&
      (!!this.topic || Object.keys(this.topics).length > 0) &&
      !!(this.config.get('APNS_VOIP_KEY') || this.config.get('APNS_VOIP_KEY_PATH'))
    );
  }

  /** JWT ES256 valable 1 h chez Apple : renouvelé toutes les 50 min */
  private bearer(): string {
    if (this.jwt && Date.now() - this.jwt.at < 50 * 60 * 1000) return this.jwt.token;
    const key = this.privateKey();
    if (!key) throw new Error('Clé APNs VoIP absente');
    const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'ES256', kid: this.keyId })}.${b64({ iss: this.teamId, iat: Math.floor(Date.now() / 1000) })}`;
    const signature = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    this.jwt = { token: `${unsigned}.${signature}`, at: Date.now() };
    return this.jwt.token;
  }

  private connect(host: string): http2.ClientHttp2Session {
    const cur = this.sessions.get(host);
    if (cur && !cur.closed && !cur.destroyed) return cur;
    const s = http2.connect(host);
    const drop = () => {
      if (this.sessions.get(host) === s) this.sessions.delete(host);
    };
    s.on('error', (e) => {
      this.logger.warn(`Connexion APNs (${host}) : ${e?.message}`);
      drop();
    });
    s.on('goaway', drop);
    s.on('close', drop);
    s.unref();
    this.sessions.set(host, s);
    return s;
  }

  /**
   * ✅ Build Debug installé depuis Xcode : jeton VoIP « sandbox ». Avec APNS_PRODUCTION=true, Apple répond
   * BadDeviceToken → nouvel essai sur le serveur sandbox (APNS_SANDBOX_FALLBACK=false pour couper).
   */
  private get sandboxFallback(): boolean {
    return String(this.config.get('APNS_SANDBOX_FALLBACK') ?? 'true').toLowerCase() !== 'false';
  }

  /** Envoie un push VoIP (le payload arrive tel quel dans l'app via PushKit) */
  async send(voipToken: string, payload: Record<string, any>, options: { ttlSeconds: number; collapseId?: string; topic?: string }): Promise<VoipSendResult> {
    const sandbox = 'https://api.sandbox.push.apple.com';
    const first = await this.sendTo(this.host, voipToken, payload, options);
    if (!first.ok && first.reason === 'BadDeviceToken' && this.host !== sandbox && this.sandboxFallback) {
      const second = await this.sendTo(sandbox, voipToken, payload, options);
      if (second.ok || second.reason !== 'BadDeviceToken') return second;
    }
    return first;
  }

  private sendTo(
    host: string,
    voipToken: string,
    payload: Record<string, any>,
    options: { ttlSeconds: number; collapseId?: string; topic?: string },
  ): Promise<VoipSendResult> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (r: VoipSendResult) => {
        if (!settled) {
          settled = true;
          resolve(r);
        }
      };
      try {
        const req = this.connect(host).request({
          ':method': 'POST',
          ':path': `/3/device/${voipToken}`,
          authorization: `bearer ${this.bearer()}`,
          'apns-topic': options.topic || this.topic,
          'apns-push-type': 'voip',
          'apns-priority': '10',
          'apns-expiration': String(Math.floor(Date.now() / 1000) + Math.max(1, options.ttlSeconds)),
          ...(options.collapseId ? { 'apns-collapse-id': options.collapseId.slice(0, 64) } : {}),
          'content-type': 'application/json',
        });
        let status = 0;
        let body = '';
        req.setEncoding('utf8');
        req.on('response', (h) => (status = Number(h[':status'] || 0)));
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          let reason: string | undefined;
          try {
            reason = body ? JSON.parse(body)?.reason : undefined;
          } catch {
            reason = body || undefined;
          }
          if (status === 403 && reason === 'ExpiredProviderToken') this.jwt = null;
          done({
            ok: status === 200,
            status,
            reason,
            invalidToken: status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'DeviceTokenNotForTopic',
          });
        });
        req.on('error', (e) => done({ ok: false, status: 0, reason: e?.message }));
        req.setTimeout(10000, () => {
          req.close();
          done({ ok: false, status: 0, reason: 'timeout' });
        });
        req.end(JSON.stringify(payload));
      } catch (e: any) {
        done({ ok: false, status: 0, reason: e?.message });
      }
    });
  }
}
