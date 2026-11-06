// src/users/sessions/user-sessions.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, LessThan, Not, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { I18nService } from 'src/libs/common/src';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { currentAudit } from 'src/audit/context/audit-context';
import { SessionRevokeReason, UserSession } from './user-session.entity';
import { MySessionsQueryDto, SessionsQueryDto } from './sessions.dto';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const num = (v: any, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

function parseDate(v?: string, endOfDay = false): Date | null {
  if (!v) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}` : v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * ✅ SESSIONS DE CONNEXION
 *  - Une session par connexion (appareil, navigateur) : IP, plateforme, appareil, dernière activité.
 *  - Le sid est dans les jetons : une session fermée invalide immédiatement l'access token et le refresh token.
 *  - Rotation du refresh token (empreinte SHA-256) ; réutilisation d'un ancien jeton = vol probable → session fermée.
 *  - Fermeture : déconnexion, « Mes appareils », administrateur, changement / réinitialisation du mot de passe,
 *    compte désactivé ou supprimé, nombre maximum de sessions dépassé.
 *  - Les anciens jetons sans session restent valides jusqu'à leur expiration (aucune déconnexion au déploiement).
 *  Réglages .env : SESSION_ENABLED, SESSION_REFRESH_DAYS, SESSION_MAX_PER_USER, SESSION_CACHE_SECONDS, SESSION_RETENTION_DAYS.
 */
@Injectable()
export class UserSessionsService {
  private readonly logger = new Logger('Sessions');
  /** Cache « session active ? » (évite une requête à chaque appel) */
  private readonly cache = new Map<string, { active: boolean; userId: string; at: number }>();
  /** Dernière mise à jour de lastActiveAt par session */
  private readonly touched = new Map<string, number>();
  /** Hors requête HTTP : même session pour access + refresh émis ensemble */
  private readonly pending = new Map<string, { p: Promise<string | null>; at: number }>();

  constructor(
    @InjectRepository(UserSession) private readonly repo: Repository<UserSession>,
    @Optional() private readonly i18n?: I18nService,
  ) {}

  private t(key: string, lang = 'fr', params?: Record<string, any>): string {
    try {
      return this.i18n ? this.i18n.translate(key, lang, params) : key;
    } catch {
      return key;
    }
  }

  // ---------------- Réglages ----------------
  get enabled(): boolean {
    return String(process.env.SESSION_ENABLED ?? 'true').toLowerCase() !== 'false';
  }
  private get refreshMs(): number {
    return num(process.env.SESSION_REFRESH_DAYS, 7) * 86400000;
  }
  private get maxPerUser(): number {
    return num(process.env.SESSION_MAX_PER_USER, 20);
  }
  private get cacheMs(): number {
    return num(process.env.SESSION_CACHE_SECONDS, 30) * 1000;
  }

  private method(path?: string | null): string {
    const p = String(path ?? '');
    if (/google-login$/.test(p)) return 'GOOGLE';
    if (/apple-login$/.test(p)) return 'APPLE';
    if (/signup$/.test(p)) return 'SIGNUP';
    if (/otp/.test(p)) return 'OTP';
    if (/refresh-token$/.test(p)) return 'REFRESH';
    if (/signin$/.test(p)) return 'PASSWORD';
    return 'OTHER';
  }

  // ============================================================
  // ÉMISSION DES JETONS
  // ============================================================
  /**
   * Session à inscrire dans les jetons émis pour cet utilisateur pendant la requête.
   * Même session pour l'access token et le refresh token ; session existante réutilisée si l'utilisateur
   * est déjà connecté (ex. changement d'entreprise). Renvoie null si les sessions sont désactivées ou en cas d'erreur
   * (le jeton reste alors valide sans session : jamais de connexion bloquée).
   */
  sidForIssue(user: { id: string }): Promise<string | null> {
    if (!this.enabled || !user?.id) return Promise.resolve(null);
    const store = currentAudit();
    if (store) {
      store.sessionIssue ??= new Map();
      const known = store.sessionIssue.get(user.id);
      if (known) return known;
      const p = this.createOrReuse(user.id);
      store.sessionIssue.set(user.id, p);
      return p;
    }
    const now = Date.now();
    for (const [k, v] of this.pending) if (now - v.at > 5000) this.pending.delete(k);
    const known = this.pending.get(user.id);
    if (known) return known.p;
    const p = this.createOrReuse(user.id);
    this.pending.set(user.id, { p, at: now });
    return p;
  }

  /** Renouvellement : réutiliser la session du refresh token */
  useForRequest(userId: string, sid: string) {
    const store = currentAudit();
    if (!store) {
      this.pending.set(userId, { p: Promise.resolve(sid), at: Date.now() });
      return;
    }
    store.sessionIssue ??= new Map();
    store.sessionIssue.set(userId, Promise.resolve(sid));
  }

  private async createOrReuse(userId: string): Promise<string | null> {
    try {
      const store = currentAudit();
      if (store?.sessionId) {
        const current = await this.repo.findOne({ where: { id: store.sessionId, userId } });
        if (current && !current.revokedAt && current.expiresAt > new Date()) return current.id;
      }
      const c = store?.client;
      const now = new Date();
      const s = await this.repo.save(
        this.repo.create({
          userId,
          loginMethod: this.method(c?.path),
          ipAddress: c?.ip ?? null,
          userAgent: c?.userAgent ?? null,
          platform: c?.platform ?? null,
          deviceId: c?.deviceId ?? null,
          deviceName: c?.deviceName ?? null,
          appVersion: c?.appVersion ?? null,
          lastActiveAt: now,
          expiresAt: new Date(now.getTime() + this.refreshMs),
        }),
      );
      this.cache.set(s.id, { active: true, userId, at: Date.now() });
      void this.enforceLimit(userId, s.id).catch(() => undefined);
      return s.id;
    } catch (e: any) {
      this.logger.warn(`Session non créée (${e?.message}) : jeton émis sans session`);
      return null;
    }
  }

  /** Enregistre l'empreinte du nouveau refresh token (rotation) et prolonge la session */
  async attachRefresh(sid: string, refreshToken: string) {
    try {
      const now = new Date();
      await this.repo
        .createQueryBuilder()
        .update(UserSession)
        .set({
          previousRefreshHash: () => '`refreshTokenHash`',
          refreshTokenHash: sha256(refreshToken),
          refreshRotatedAt: now,
          lastActiveAt: now,
          expiresAt: new Date(now.getTime() + this.refreshMs),
        })
        .where('id = :sid AND revokedAt IS NULL', { sid })
        .execute();
    } catch (e: any) {
      this.logger.warn(`Session ${sid} : refresh non enregistré (${e?.message})`);
    }
  }

  /**
   * Vérifie le refresh token reçu. Renvoie le sid à réutiliser, ou null pour un ancien jeton sans session.
   * Lève une erreur si la session est fermée, expirée, ou si le jeton a déjà servi (session alors fermée).
   */
  async validateRefresh(decoded: { id: string; sid?: string }, refreshToken: string, lang = 'fr'): Promise<string | null> {
    if (!this.enabled || !decoded?.sid) return null;
    let s: UserSession | null;
    try {
      s = await this.repo
        .createQueryBuilder('s')
        .addSelect(['s.refreshTokenHash', 's.previousRefreshHash'])
        .where('s.id = :id', { id: decoded.sid })
        .getOne();
    } catch {
      return null; // table absente : comportement d'avant
    }
    if (!s || s.userId !== decoded.id || s.revokedAt) {
      throw new BadRequestException(this.t('user.session_revoked', lang));
    }
    if (s.expiresAt <= new Date()) {
      await this.revoke(s.id, SessionRevokeReason.EXPIRED);
      throw new BadRequestException(this.t('user.session_expired', lang));
    }
    const h = sha256(refreshToken);
    if (s.refreshTokenHash && h !== s.refreshTokenHash) {
      const grace =
        s.previousRefreshHash === h && !!s.refreshRotatedAt && Date.now() - new Date(s.refreshRotatedAt).getTime() < 60000;
      if (!grace) {
        await this.revoke(s.id, SessionRevokeReason.TOKEN_REUSE);
        this.logger.warn(`⚠️ Refresh token réutilisé : session ${s.id} (utilisateur ${s.userId}) fermée`);
        throw new BadRequestException(this.t('user.session_token_reused', lang));
      }
    }
    return s.id;
  }

  // ============================================================
  // CONTRÔLE À CHAQUE REQUÊTE
  // ============================================================
  /** La session du jeton est-elle encore ouverte ? (cache de SESSION_CACHE_SECONDS) */
  async isActive(sid: string, userId: string): Promise<boolean> {
    if (!this.enabled) return true;
    const hit = this.cache.get(sid);
    if (hit && Date.now() - hit.at < this.cacheMs) return hit.active && hit.userId === userId;
    try {
      const s = await this.repo.findOne({ where: { id: sid }, select: ['id', 'userId', 'revokedAt', 'expiresAt'] });
      const active = !!s && !s.revokedAt && s.expiresAt > new Date();
      this.cache.set(sid, { active, userId: s?.userId ?? userId, at: Date.now() });
      if (this.cache.size > 50000) this.cache.clear();
      return active && s!.userId === userId;
    } catch {
      return true; // base indisponible / table absente : ne pas bloquer
    }
  }

  /** Dernière activité (au plus une écriture toutes les 5 minutes par session) */
  touch(sid: string) {
    const last = this.touched.get(sid) ?? 0;
    if (Date.now() - last < 5 * 60 * 1000) return;
    this.touched.set(sid, Date.now());
    if (this.touched.size > 50000) this.touched.clear();
    const c = currentAudit()?.client;
    void this.repo
      .update({ id: sid }, { lastActiveAt: new Date(), ...(c?.ip ? { ipAddress: c.ip } : {}) })
      .catch(() => undefined);
  }

  // ============================================================
  // FERMETURE
  // ============================================================
  async revoke(sid: string, reason: SessionRevokeReason, byId?: string | null, note?: string | null): Promise<boolean> {
    const res = await this.repo
      .createQueryBuilder()
      .update(UserSession)
      .set({ revokedAt: new Date(), revokedReason: reason, revokedById: byId ?? null, revokedNote: note ?? null })
      .where('id = :sid AND revokedAt IS NULL', { sid })
      .execute();
    this.cache.set(sid, { active: false, userId: this.cache.get(sid)?.userId ?? '', at: Date.now() });
    return !!res.affected;
  }

  /** Ferme toutes les sessions d'un utilisateur (sauf exceptSid). Ne lève jamais d'erreur. */
  async revokeAllForUser(userId: string, reason: SessionRevokeReason, opts: { exceptSid?: string | null; byId?: string | null; note?: string | null } = {}): Promise<number> {
    try {
      const open = await this.repo.find({ where: { userId, revokedAt: IsNull() }, select: ['id'] });
      const ids = open.map((s) => s.id).filter((id) => id !== opts.exceptSid);
      if (!ids.length) return 0;
      await this.repo
        .createQueryBuilder()
        .update(UserSession)
        .set({ revokedAt: new Date(), revokedReason: reason, revokedById: opts.byId ?? null, revokedNote: opts.note ?? null })
        .whereInIds(ids)
        .execute();
      for (const id of ids) this.cache.set(id, { active: false, userId, at: Date.now() });
      return ids.length;
    } catch (e: any) {
      this.logger.warn(`Fermeture des sessions de ${userId} : ${e?.message}`);
      return 0;
    }
  }

  /** Au-delà de SESSION_MAX_PER_USER sessions ouvertes, les plus anciennes sont fermées */
  private async enforceLimit(userId: string, keepId: string) {
    const open = await this.repo.find({
      where: { userId, revokedAt: IsNull() },
      order: { lastActiveAt: 'DESC' },
      select: ['id', 'lastActiveAt'],
    });
    const extra = open.filter((s) => s.id !== keepId).slice(Math.max(0, this.maxPerUser - 1));
    for (const s of extra) await this.revoke(s.id, SessionRevokeReason.LIMIT_EXCEEDED);
  }

  // ============================================================
  // CONSULTATION
  // ============================================================
  private status(s: UserSession): 'ACTIVE' | 'REVOKED' | 'EXPIRED' {
    if (s.revokedAt) return s.revokedReason === SessionRevokeReason.EXPIRED ? 'EXPIRED' : 'REVOKED';
    return s.expiresAt <= new Date() ? 'EXPIRED' : 'ACTIVE';
  }

  private view(s: UserSession, currentSid?: string | null, lang = 'fr') {
    const { user, ...rest } = s as any;
    return {
      ...rest,
      status: this.status(s),
      isCurrent: !!currentSid && s.id === currentSid,
      revokedReasonLabel: s.revokedReason ? this.t(`user.session_reason.${s.revokedReason}`, lang) : null,
      ...(user
        ? { user: { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, image: user.image } }
        : {}),
    };
  }

  /** Mes sessions (« Mes appareils ») */
  async mine(userId: string, currentSid: string | null, q: MySessionsQueryDto, lang = 'fr') {
    const qb = this.repo.createQueryBuilder('s').where('s.userId = :userId', { userId });
    if (q.all === 'true') {
      qb.andWhere('(s.revokedAt IS NULL OR s.revokedAt >= :since)', { since: new Date(Date.now() - 30 * 86400000) });
    } else {
      qb.andWhere('s.revokedAt IS NULL').andWhere('s.expiresAt > :now', { now: new Date() });
    }
    const rows = await qb.orderBy('s.lastActiveAt', 'DESC').take(100).getMany();
    const data = rows.map((s) => this.view(s, currentSid, lang)).sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
    return {
      message: this.t('user.session_list', lang),
      data: { currentSessionId: currentSid, total: data.length, sessions: data },
    };
  }

  async revokeMine(userId: string, sid: string, lang = 'fr') {
    const s = await this.repo.findOne({ where: { id: sid, userId } });
    if (!s) throw new NotFoundException(this.t('user.session_not_found', lang));
    await this.revoke(s.id, SessionRevokeReason.REVOKED_BY_USER, userId);
    return { message: this.t('user.session_closed', lang), data: { id: s.id } };
  }

  async revokeOthers(userId: string, currentSid: string | null, lang = 'fr') {
    const count = await this.revokeAllForUser(userId, SessionRevokeReason.REVOKED_BY_USER, { exceptSid: currentSid, byId: userId });
    return { message: this.t('user.session_others_closed', lang, { count }), data: { closed: count } };
  }

  async logout(userId: string, currentSid: string | null, all = false, lang = 'fr') {
    let closed = 0;
    if (all) closed = await this.revokeAllForUser(userId, SessionRevokeReason.LOGOUT, { byId: userId });
    else if (currentSid) closed = (await this.revoke(currentSid, SessionRevokeReason.LOGOUT, userId)) ? 1 : 0;
    return { message: this.t('user.logout_success', lang), data: { closed } };
  }

  /** Liste de toutes les sessions (administration) */
  async list(q: SessionsQueryDto, lang = 'fr') {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 20));
    const now = new Date();
    const qb = this.repo.createQueryBuilder('s').leftJoinAndSelect('s.user', 'u');
    const status = q.status ?? 'active';
    if (status === 'active') qb.andWhere('s.revokedAt IS NULL').andWhere('s.expiresAt > :now', { now });
    if (status === 'revoked') qb.andWhere('s.revokedAt IS NOT NULL').andWhere('(s.revokedReason IS NULL OR s.revokedReason <> :exp)', { exp: SessionRevokeReason.EXPIRED });
    if (status === 'expired') {
      qb.andWhere(
        new Brackets((b) =>
          b.where('s.revokedReason = :exp', { exp: SessionRevokeReason.EXPIRED }).orWhere('(s.revokedAt IS NULL AND s.expiresAt <= :now)', { now }),
        ),
      );
    }
    if (q.userId) qb.andWhere('s.userId = :userId', { userId: q.userId });
    if (q.platform) qb.andWhere('s.platform = :platform', { platform: q.platform.toLowerCase() });
    if (q.ip) qb.andWhere('s.ipAddress = :ip', { ip: q.ip });
    const from = parseDate(q.from);
    const to = parseDate(q.to, true);
    if (from) qb.andWhere('s.lastActiveAt >= :from', { from });
    if (to) qb.andWhere('s.lastActiveAt <= :to', { to });
    if (q.search?.trim()) {
      const kw = `%${q.search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('LOWER(u.fullName) LIKE :kw', { kw })
            .orWhere('LOWER(u.email) LIKE :kw', { kw })
            .orWhere('u.phone LIKE :kw', { kw })
            .orWhere('LOWER(s.deviceName) LIKE :kw', { kw })
            .orWhere('s.ipAddress LIKE :kw', { kw }),
        ),
      );
    }
    const sortCol = q.sortBy === 'createdAt' ? 's.createdAt' : 's.lastActiveAt';
    const order = String(q.sortOrder ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const [rows, total] = await qb.orderBy(sortCol, order).addOrderBy('s.id', 'ASC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return {
      message: this.t('user.session_list', lang),
      data: new PaginatedResponseDto<any>(rows.map((s) => this.view(s, null, lang)), total, page, limit),
    };
  }

  async stats(lang = 'fr') {
    const now = new Date();
    const active = () => this.repo.createQueryBuilder('s').where('s.revokedAt IS NULL').andWhere('s.expiresAt > :now', { now });
    const [sessions, users, byPlatform, last24h, reuse7d] = await Promise.all([
      active().getCount(),
      active().select('COUNT(DISTINCT s.userId)', 'n').getRawOne(),
      active().select('s.platform', 'platform').addSelect('COUNT(*)', 'count').groupBy('s.platform').getRawMany(),
      this.repo.count({ where: { lastActiveAt: Not(LessThan(new Date(Date.now() - 86400000))) } }),
      this.repo
        .createQueryBuilder('s')
        .where('s.revokedReason = :r', { r: SessionRevokeReason.TOKEN_REUSE })
        .andWhere('s.revokedAt >= :since', { since: new Date(Date.now() - 7 * 86400000) })
        .getCount(),
    ]);
    return {
      message: this.t('user.session_stats', lang),
      data: {
        activeSessions: sessions,
        connectedUsers: Number(users?.n ?? 0),
        activeLast24h: last24h,
        tokenReuseLast7d: reuse7d,
        byPlatform: byPlatform.map((r) => ({ platform: r.platform ?? 'unknown', count: Number(r.count) })),
      },
    };
  }

  async adminRevoke(sid: string, adminId: string, note: string | undefined, lang = 'fr') {
    const s = await this.repo.findOne({ where: { id: sid } });
    if (!s) throw new NotFoundException(this.t('user.session_not_found', lang));
    await this.revoke(s.id, SessionRevokeReason.REVOKED_BY_ADMIN, adminId, note ?? null);
    return { message: this.t('user.session_closed', lang), data: { id: s.id, userId: s.userId } };
  }

  async adminRevokeUser(userId: string, adminId: string, note: string | undefined, lang = 'fr') {
    const count = await this.revokeAllForUser(userId, SessionRevokeReason.REVOKED_BY_ADMIN, { byId: adminId, note: note ?? null });
    return { message: this.t('user.session_user_closed', lang, { count }), data: { userId, closed: count } };
  }

  // ============================================================
  // ENTRETIEN (toutes les heures)
  // ============================================================
  @Cron('0 17 * * * *')
  async cleanup() {
    if (!this.enabled) return;
    try {
      const now = new Date();
      await this.repo
        .createQueryBuilder()
        .update(UserSession)
        .set({ revokedAt: () => '`expiresAt`', revokedReason: SessionRevokeReason.EXPIRED })
        .where('revokedAt IS NULL AND expiresAt <= :now', { now })
        .execute();
      const days = num(process.env.SESSION_RETENTION_DAYS, 90);
      const limit = new Date(Date.now() - days * 86400000);
      await this.repo.createQueryBuilder().delete().from(UserSession).where('revokedAt IS NOT NULL AND revokedAt < :limit', { limit }).execute();
    } catch (e: any) {
      this.logger.warn(`Entretien des sessions : ${e?.message}`);
    }
  }
}
