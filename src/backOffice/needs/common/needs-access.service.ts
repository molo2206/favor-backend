import { BadRequestException, ForbiddenException, forwardRef, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';
import { NotificationsService } from 'src/notification/notifications.service';
import { NotificationsGateway } from 'src/notification/notifications.gateway';
import { FcmService } from 'src/notification/fcm.service';
import { NotificationType } from 'src/notification/type/notification.type';
import { normalizeChannels } from 'src/notification/utils/platform-channel';
import { isCompanyOwner, isPlatformAdmin, resolveCompanyId } from 'src/backOffice/logistics/common/logistics-access';
import { NeedAction, NeedMemberRole } from './needs.enums';
import { NeedLog } from '../entities/need.entity';
import { NeedMember } from '../entities/need-config.entity';
import { NeedSignature, NeedSignatureRole } from '../entities/need-signature.entity';
import { UserSignaturesService } from 'src/user-signatures/user-signatures.service';

export type NeedContext = {
  companyId: string;
  /** ADMIN, FINANCE, VIEWER ; null = agent / validateur seulement */
  role: NeedMemberRole | null;
  user: UserEntity;
};

export type Person = { id: string; fullName: string | null; phone: string | null; image: string | null; email?: string | null };

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Date du jour AAAA-MM-JJ */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Taux de change (exchange_rates : unités pour 1 USD) */
export class NeedRates {
  private readonly cache = new Map<string, number | null>();
  constructor(private readonly m: EntityManager) { }

  async rate(currency: string): Promise<number | null> {
    const cur = String(currency || '').trim().toUpperCase();
    if (!cur) return null;
    if (this.cache.has(cur)) return this.cache.get(cur)!;
    let v = NaN;
    try {
      const rows = await this.m.query(
        'SELECT `value` FROM `exchange_rates` WHERE `currency` = ? AND `deleted` = 0 AND `status` = 1 ORDER BY `updatedAt` DESC LIMIT 1',
        [cur],
      );
      v = Number(rows?.[0]?.value);
    } catch {
      /* table absente */
    }
    if (!(v > 0)) v = cur === 'USD' ? 1 : NaN;
    const out = v > 0 ? v : null;
    this.cache.set(cur, out);
    return out;
  }

  async convert(amount: number, from: string, to: string): Promise<number | null> {
    const f = String(from || '').toUpperCase();
    const t = String(to || '').toUpperCase();
    if (!f || !t || f === t) return round2(amount);
    const [rf, rt] = await Promise.all([this.rate(f), this.rate(t)]);
    if (!rf || !rt) return null;
    return round2((Number(amount) / rf) * rt);
  }
}

/**
 * ✅ États de besoins : accès, personnes, historique, notifications et appels.
 *  - Administrateur du module : admin plateforme, propriétaire de l'entreprise, membre ADMIN ;
 *  - Service financier : membres FINANCE + responsables / caissiers de la Trésorerie ;
 *  - Lecteur : membres VIEWER ;
 *  - Tout utilisateur rattaché à l'entreprise : créer et suivre ses propres états de besoins,
 *    et valider ceux qui lui sont assignés.
 */
@Injectable()
export class NeedsAccessService {
  private readonly logger = new Logger(NeedsAccessService.name);

  constructor(
    @InjectDataSource() readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly notifications: NotificationsService,
    private readonly fcm: FcmService,
    @Inject(forwardRef(() => NotificationsGateway)) private readonly gateway: NotificationsGateway,
    @Optional() readonly userSignatures?: UserSignaturesService,
  ) { }

  // ============================================================
  // SIGNATURES
  // ============================================================

  /** NEEDS_SIGNATURE_REQUIRED=true : impossible de soumettre / valider / autoriser / payer sans signature enregistrée */
  get signatureRequired(): boolean {
    return String(process.env.NEEDS_SIGNATURE_REQUIRED ?? 'false').toLowerCase() === 'true';
  }

  /**
   * Appose la signature de l'utilisateur (copie de l'URL de son image à cet instant).
   * À appeler dans la transaction de l'action : si la signature est obligatoire et absente, l'action est annulée.
   */
  async sign(
    m: EntityManager,
    need: { id: string; companyId: string },
    user: UserEntity,
    opts: { role: NeedSignatureRole; action: string; level?: number | null; levelName?: string | null; refId?: string | null; replace?: boolean },
    lang: string,
  ): Promise<void> {
    const url = (await this.userSignatures?.urlOf(user.id)) ?? null;
    if (!url && this.signatureRequired) throw new BadRequestException(this.t('needs.signature_required', lang));
    try {
      if (opts.replace) {
        await m.delete(NeedSignature, { needId: need.id, role: opts.role, ...(opts.level ? { level: opts.level } : {}) } as any);
      }
      await m.insert(NeedSignature, {
        needId: need.id,
        companyId: need.companyId,
        userId: user.id,
        signerName: user.fullName ?? null,
        role: opts.role,
        action: opts.action,
        level: opts.level ?? null,
        levelName: opts.levelName ?? null,
        refId: opts.refId ?? null,
        signatureUrl: url,
        signedAt: new Date(),
      } as any);
    } catch (e: any) {
      // Table absente (SQL non exécuté) : l'action continue, la signature n'est pas enregistrée
      if (this.signatureRequired) throw e;
      this.logger.warn(`Signature non enregistrée (${need.id}) : ${e?.message}`);
    }
  }

  /** Signatures d'un état de besoin, dans l'ordre (la plus récente par signataire / rôle / niveau) */
  async signaturesOf(needId: string, m: EntityManager = this.m) {
    let rows: NeedSignature[] = [];
    try {
      rows = await m.find(NeedSignature, { where: { needId }, order: { signedAt: 'ASC' } });
    } catch {
      return [];
    }
    const latest = new Map<string, NeedSignature>();
    for (const r of rows) latest.set(`${r.role}|${r.level ?? ''}|${r.userId}|${r.refId ?? ''}`, r);
    const order: Record<string, number> = { REQUESTER: 0, VALIDATOR: 1, FINANCE: 2, CASHIER: 3 };
    return [...latest.values()]
      .sort((a, b) => order[a.role] - order[b.role] || (a.level ?? 0) - (b.level ?? 0) || +new Date(a.signedAt) - +new Date(b.signedAt))
      .map((r) => ({
        id: r.id,
        role: r.role,
        action: r.action,
        level: r.level ?? null,
        levelName: r.levelName ?? null,
        refId: r.refId ?? null,
        userId: r.userId,
        signerName: r.signerName ?? null,
        signatureUrl: r.signatureUrl ?? null,
        hasImage: !!r.signatureUrl,
        signedAt: r.signedAt,
      }));
  }

  t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params);
  }

  get m(): EntityManager {
    return this.dataSource.manager;
  }

  // ============================================================
  // RÉGLAGES (.env)
  // ============================================================
  envNum(key: string, def: number, min = 0) {
    const v = Number(process.env[key]);
    return Number.isFinite(v) && v >= min ? v : def;
  }

  get reminderMinutes() {
    return this.envNum('NEEDS_REMINDER_MINUTES', 120, 5);
  }

  get maxReminders() {
    return this.envNum('NEEDS_MAX_REMINDERS', 3, 0);
  }

  get ringSeconds() {
    return this.envNum('NEEDS_CALL_RING_SECONDS', 45, 10);
  }

  get callEnabled() {
    return String(process.env.NEEDS_CALL ?? 'true').toLowerCase() !== 'false';
  }

  /** Applications qui sonnent / reçoivent les notifications (défaut : back-office + mobile) */
  get channels() {
    return normalizeChannels(String(process.env.NEEDS_CHANNELS ?? 'group,mobile,admin').split(','));
  }

  // ============================================================
  // ACCÈS
  // ============================================================

  async roleOf(user: UserEntity, companyId: string): Promise<NeedMemberRole | null> {
    if (isPlatformAdmin(user) || (await isCompanyOwner(this.dataSource, user, companyId))) return NeedMemberRole.ADMIN;
    const member = await this.m.findOne(NeedMember, { where: { companyId, userId: user.id } });
    if (member?.role) return member.role;
    // Responsables / caissiers de la Trésorerie = service financier
    try {
      const fin = await this.m.query(
        "SELECT `role` FROM `bo_finance_members` WHERE `companyId` = ? AND `userId` = ? AND `role` IN ('MANAGER','CASHIER') LIMIT 1",
        [companyId, user.id],
      );
      if (fin?.length) return NeedMemberRole.FINANCE;
    } catch {
      /* module trésorerie absent */
    }
    return null;
  }

  async context(user: UserEntity, companyId: string | null | undefined, lang: string): Promise<NeedContext> {
    const id = await resolveCompanyId(this.dataSource, user, companyId, {
      required: this.t('needs.company_required', lang),
      forbidden: this.t('needs.forbidden', lang),
    });
    return { companyId: id, role: await this.roleOf(user, id), user };
  }

  isAdmin(ctx: NeedContext) {
    return ctx.role === NeedMemberRole.ADMIN;
  }

  isFinance(ctx: NeedContext) {
    return ctx.role === NeedMemberRole.ADMIN || ctx.role === NeedMemberRole.FINANCE;
  }

  /** Tout voir : administrateur, finance, lecteur */
  seesAll(ctx: NeedContext) {
    return !!ctx.role;
  }

  assertAdmin(ctx: NeedContext, lang: string) {
    if (!this.isAdmin(ctx)) throw new ForbiddenException(this.t('needs.admin_only', lang));
  }

  assertFinance(ctx: NeedContext, lang: string) {
    if (!this.isFinance(ctx)) throw new ForbiddenException(this.t('needs.finance_only', lang));
  }

  // ============================================================
  // PERSONNES / RÔLES DYNAMIQUES
  // ============================================================

  async people(ids: (string | null | undefined)[], m: EntityManager = this.m): Promise<Map<string, Person>> {
    const unique = [...new Set(ids.filter(Boolean) as string[])];
    const out = new Map<string, Person>();
    if (!unique.length) return out;
    const rows: any[] = await m.query(
      `SELECT id, fullName, phone, image, email FROM users WHERE id IN (${unique.map(() => '?').join(',')})`,
      unique,
    );
    for (const r of rows) out.set(r.id, { id: r.id, fullName: r.fullName ?? null, phone: r.phone ?? null, image: r.image ?? null, email: r.email ?? null });
    return out;
  }

  async ownerIds(companyId: string, m: EntityManager = this.m): Promise<string[]> {
    const rows: { userId: string }[] = await m.query('SELECT `userId` FROM `user_has_company` WHERE `companyId` = ? AND `isOwner` = 1', [companyId]);
    return rows.map((r) => r.userId);
  }

  async memberIds(companyId: string, role: NeedMemberRole, m: EntityManager = this.m): Promise<string[]> {
    const rows: { userId: string }[] = await m.query('SELECT `userId` FROM `bo_need_members` WHERE `companyId` = ? AND `role` = ?', [companyId, role]);
    return rows.map((r) => r.userId);
  }

  /** Service financier : membres FINANCE + responsables / caissiers de la trésorerie (sinon propriétaires) */
  async financeIds(companyId: string, m: EntityManager = this.m): Promise<string[]> {
    const ids = new Set(await this.memberIds(companyId, NeedMemberRole.FINANCE, m));
    try {
      const rows: { userId: string }[] = await m.query(
        "SELECT `userId` FROM `bo_finance_members` WHERE `companyId` = ? AND `role` IN ('MANAGER','CASHIER')",
        [companyId],
      );
      rows.forEach((r) => ids.add(r.userId));
    } catch {
      /* module trésorerie absent */
    }
    if (!ids.size) (await this.ownerIds(companyId, m)).forEach((id) => ids.add(id));
    return [...ids];
  }

  async adminIds(companyId: string, m: EntityManager = this.m): Promise<string[]> {
    return [...new Set([...(await this.memberIds(companyId, NeedMemberRole.ADMIN, m)), ...(await this.ownerIds(companyId, m))])];
  }

  /** Département du demandeur (fiche employé RH) */
  async departmentOf(userId: string, companyId: string, m: EntityManager = this.m): Promise<{ id: string; name: string; managerId: string | null; parentId: string | null } | null> {
    try {
      const rows: any[] = await m.query(
        `SELECT d.*
           FROM hr_employees e JOIN hr_departments d ON d.id = e.departmentId
          WHERE e.userId = ? AND (e.companyId = ? OR e.companyId IS NULL)
          ORDER BY (e.companyId = ?) DESC LIMIT 1`,
        [userId, companyId, companyId],
      );
      const r = rows?.[0];
      return r ? { id: r.id, name: r.name, managerId: r.managerId ?? null, parentId: r.parentDepartmentId ?? r.parentId ?? null } : null;
    } catch (e: any) {
      this.logger.warn(`Département de l'employé ${userId} introuvable : ${e?.message}`);
      return null;
    }
  }

  async department(id: string | null | undefined, m: EntityManager = this.m): Promise<{ id: string; name: string; managerId: string | null; parentId: string | null; companyId: string | null } | null> {
    if (!id) return null;
    try {
      // SELECT * : fonctionne même si une colonne facultative (parent, entreprise…) manque dans la table du serveur
      const rows: any[] = await m.query('SELECT * FROM `hr_departments` WHERE `id` = ? LIMIT 1', [id]);
      const r = rows?.[0];
      if (!r) return null;
      return {
        id: r.id,
        name: r.name,
        managerId: r.managerId ?? null,
        parentId: r.parentDepartmentId ?? r.parentId ?? null,
        companyId: r.companyId ?? null,
      };
    } catch (e: any) {
      this.logger.warn(`Lecture du département ${id} impossible : ${e?.message}`);
      return null;
    }
  }

  /** Validateurs indisponibles aujourd'hui → leur remplaçant */
  async unavailable(companyId: string, userIds: string[], m: EntityManager = this.m): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return out;
    const rows: any[] = await m.query(
      `SELECT userId, delegateId FROM bo_need_members
        WHERE companyId = ? AND userId IN (${ids.map(() => '?').join(',')})
          AND unavailableUntil IS NOT NULL AND unavailableUntil >= NOW()
          AND (unavailableFrom IS NULL OR unavailableFrom <= NOW())`,
      [companyId, ...ids],
    );
    for (const r of rows) out.set(r.userId, r.delegateId ?? null);
    return out;
  }

  // ============================================================
  // HISTORIQUE (ajout seulement)
  // ============================================================

  async log(
    m: EntityManager,
    needId: string,
    action: NeedAction,
    user: { id: string; fullName?: string | null } | null,
    extra: { level?: number; fromStatus?: string | null; toStatus?: string | null; comment?: string | null; payload?: Record<string, any> | null; ip?: string | null } = {},
  ) {
    try {
      await m.insert(NeedLog, {
        needId,
        action,
        level: extra.level ?? 0,
        userId: user?.id ?? null,
        userName: user?.fullName ?? null,
        fromStatus: extra.fromStatus ?? null,
        toStatus: extra.toStatus ?? null,
        comment: extra.comment ?? null,
        payload: extra.payload ?? null,
        ip: extra.ip ?? null,
      } as any);
    } catch (e: any) {
      this.logger.warn(`Historique état de besoin ${needId} : ${e?.message}`);
    }
  }

  // ============================================================
  // NOTIFICATIONS / APPELS
  // ============================================================

  /** Notification enregistrée + push ; renvoie les destinataires */
  async notify(userIds: string[], key: string, params: Record<string, any>, data: Record<string, any>, lang: string): Promise<string[]> {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return [];
    const title = this.t(`needs.notif.${key}.title`, lang, params);
    const body = this.t(`needs.notif.${key}.body`, lang, params);
    const payload = { category: 'needs', screen: 'need_request', event: key, ...data };
    try {
      await this.notifications.sendAndSaveNotificationToUsers(ids, title, body, NotificationType.NEED_REQUEST, payload, { channels: this.channels });
    } catch (e: any) {
      this.logger.warn(`Notification état de besoin : ${e?.message}`);
    }
    void this.fcm
      .sendPushToUsers(ids, title, body, { type: NotificationType.NEED_REQUEST, ...payload }, { tag: data.needId ? `need-${data.needId}` : undefined, channels: this.channels })
      .catch((e) => this.logger.warn(`Push état de besoin : ${e?.message}`));
    return ids;
  }

  callId(needId: string, level: number) {
    return `need-${needId}-${level}`;
  }

  /** Appel (sonnerie) comme pour les commandes / livraisons ; renvoie les personnes atteintes */
  async call(userIds: string[], needId: string, level: number, params: Record<string, any>, data: Record<string, any>, lang: string): Promise<string[]> {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return [];
    // Sonnerie dans le back-office ouvert (temps réel)
    for (const id of ids) {
      void this.gateway
        .emitToUserChannels(id, 'needs:approval-call', { ...data, ...params, ringSeconds: this.ringSeconds }, undefined)
        .catch(() => undefined);
    }
    if (!this.callEnabled) return [];
    try {
      return await this.fcm.sendCallToUsers(
        ids,
        this.t('needs.notif.approval_call.title', lang, params),
        this.t('needs.notif.approval_call.body', lang, params),
        { type: NotificationType.NEED_REQUEST, category: 'needs', event: 'approval_call', ...data },
        {
          callId: this.callId(needId, level),
          ttlSeconds: this.ringSeconds,
          androidChannelId: process.env.NEEDS_CALL_ANDROID_CHANNEL_ID || process.env.CASH_FLOW_CALL_ANDROID_CHANNEL_ID || process.env.RIDE_CALL_ANDROID_CHANNEL_ID || undefined,
          iosSound: process.env.NEEDS_CALL_IOS_SOUND || undefined,
          androidSound: process.env.NEEDS_CALL_ANDROID_SOUND || 'default',
          iosCategory: 'NEED_CALL',
          channels: this.channels,
        },
      );
    } catch (e: any) {
      this.logger.warn(`Appel état de besoin ${needId} : ${e?.message}`);
      return [];
    }
  }

  stopRinging(userIds: string[], needId: string, level: number, reason: string) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return;
    const callId = this.callId(needId, level);
    void this.fcm.cancelCallForUsers(ids, callId, reason, { category: 'needs', needId }, this.channels).catch(() => undefined);
    for (const id of ids) {
      void this.gateway.emitToUserChannels(id, 'needs:approval-call-cancel', { needId, level, callId, reason }, undefined).catch(() => undefined);
    }
  }

  /** Écrans ouverts : mise à jour en temps réel */
  emit(userIds: string[], event: string, payload: any) {
    for (const id of [...new Set(userIds.filter(Boolean))]) {
      void this.gateway.emitToUserChannels(id, event, payload, undefined).catch(() => undefined);
    }
  }
}
