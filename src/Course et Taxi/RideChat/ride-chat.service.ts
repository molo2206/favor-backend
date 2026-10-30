import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import { promises as fs } from 'fs';
import { Ride } from 'src/Course et Taxi/Ride/entity/Ride.entity';
import { RideStatus } from 'src/Course et Taxi/Ride/enum/RideStatus.enum';
import { RideRealtimeService } from 'src/Course et Taxi/Ride/ride-realtime.service';
import { UserEntity } from 'src/users/entities/user.entity';
import { FcmService } from 'src/notification/fcm.service';
import { FilesService } from 'src/files/files.service';
import { I18nService } from 'src/libs/common/src';
import { NotificationType } from 'src/notification/type/notification.type';
import { resolveChannels } from 'src/notification/utils/platform-channel';
import { RideChatMessage, RideChatMessageType, RideChatSenderRole } from './entity/ride-chat-message.entity';
import {
  AdminRideChatConversationsQueryDto,
  AdminRideChatMessagesQueryDto,
  AdminRideChatStatsQueryDto,
  MyRideChatsQueryDto,
  RideChatMessagesQueryDto,
  SendRideChatAudioDto,
  SendRideChatTextDto,
} from './dto/ride-chat.dto';
import { RideChatSocketEvents } from './ride-chat.events';

type ChatContext = {
  ride: Ride;
  role: RideChatSenderRole;
  /** L'autre participant (null si aucun chauffeur affecté) */
  otherId: string | null;
};

/** Statuts pendant lesquels le passager et le chauffeur peuvent s'écrire */
const OPEN_STATUSES: string[] = [RideStatus.ACCEPTED, RideStatus.ARRIVED, RideStatus.IN_PROGRESS];

/**
 * ✅ Chat chauffeur ↔ client (une conversation par course), messages texte et vocaux.
 *
 *  - Temps réel : WebSocket principal (room personnelle de chaque participant) :
 *      'ride:chat-message', 'ride:chat-read', 'ride:chat-typing', 'ride:chat-deleted', 'ride:chat-restored'
 *  - Push Firebase au destinataire (regroupé par course : tag ride-chat-<rideId>)
 *  - Fichiers vocaux : FilesService (uploads/ride-chat/…), durée lue par ffprobe si disponible
 *  - Historique complet côté administration (messages supprimés compris)
 *
 * Variables .env (toutes optionnelles) :
 *   RIDE_CHAT_GRACE_MINUTES=30        discussion encore possible après la fin / l'annulation de la course
 *   RIDE_CHAT_AUDIO_MAX_SECONDS=180   durée max d'un message vocal
 *   RIDE_CHAT_AUDIO_MAX_MB=10         taille max d'un message vocal
 *   RIDE_CHAT_DELETE_MINUTES=60       délai pour supprimer son propre message (0 = toujours)
 *   RIDE_CHAT_PUSH=always             always | offline (seulement si hors ligne) | never
 *   RIDE_CHAT_ANDROID_CHANNEL_ID=     canal Android des notifications de message (optionnel)
 */
@Injectable()
export class RideChatService {
  private readonly logger = new Logger(RideChatService.name);

  constructor(
    @InjectRepository(RideChatMessage) private readonly repo: Repository<RideChatMessage>,
    @InjectRepository(Ride) private readonly rideRepo: Repository<Ride>,
    private readonly realtime: RideRealtimeService,
    private readonly fcm: FcmService,
    private readonly files: FilesService,
    private readonly i18n: I18nService,
    private readonly config: ConfigService,
  ) { }

  // ============================================================
  // Réglages
  // ============================================================

  private num(key: string, def: number): number {
    const v = Number(this.config.get(key));
    return Number.isFinite(v) && v >= 0 ? v : def;
  }
  private get graceMinutes() {
    return this.num('RIDE_CHAT_GRACE_MINUTES', 30);
  }
  private get audioMaxSeconds() {
    return this.num('RIDE_CHAT_AUDIO_MAX_SECONDS', 180);
  }
  private get audioMaxBytes() {
    return Math.max(1, this.num('RIDE_CHAT_AUDIO_MAX_MB', 10)) * 1024 * 1024;
  }
  private get deleteMinutes() {
    return this.num('RIDE_CHAT_DELETE_MINUTES', 60);
  }
  private get pushMode(): 'always' | 'offline' | 'never' {
    const m = String(this.config.get('RIDE_CHAT_PUSH') || 'always').toLowerCase();
    return m === 'never' || m === 'offline' ? m : 'always';
  }

  private t(key: string, lang = 'fr', params?: Record<string, any>) {
    return this.i18n.translate(key, lang, params);
  }

  // ============================================================
  // Accès
  // ============================================================

  /** La course existe et l'utilisateur en est le passager ou le chauffeur */
  private async context(rideId: string, user: UserEntity, lang: string): Promise<ChatContext> {
    const ride = await this.rideRepo.findOne({ where: { id: rideId }, relations: { rider: true, driver: true } });
    if (!ride) throw new NotFoundException(this.t('ride.ride_not_found', lang));
    const role =
      ride.driverId && ride.driverId === user.id
        ? RideChatSenderRole.DRIVER
        : ride.riderId === user.id
          ? RideChatSenderRole.RIDER
          : null;
    if (!role) throw new ForbiddenException(this.t('ride.forbidden', lang));
    const otherId = role === RideChatSenderRole.DRIVER ? ride.riderId : ride.driverId ?? null;
    return { ride, role, otherId };
  }

  /** Peut-on encore écrire ? (chauffeur affecté + course en cours, ou terminée depuis peu) */
  canWrite(ride: Ride): boolean {
    if (!ride.driverId) return false;
    if (OPEN_STATUSES.includes(ride.status)) return true;
    if (ride.status === RideStatus.COMPLETED || ride.status === RideStatus.CANCELLED) {
      const end = ride.completedAt || ride.cancelledAt || ride.updatedAt;
      return !!end && Date.now() - new Date(end).getTime() <= this.graceMinutes * 60 * 1000;
    }
    return false;
  }

  private assertWritable(ctx: ChatContext, lang: string) {
    if (!ctx.ride.driverId || !ctx.otherId) throw new BadRequestException(this.t('ride_chat.no_driver', lang));
    if (!this.canWrite(ctx.ride)) throw new BadRequestException(this.t('ride_chat.closed', lang));
  }

  // ============================================================
  // Mise en forme
  // ============================================================

  private person(u?: UserEntity | null) {
    return u ? { id: u.id, fullName: u.fullName ?? null, phone: u.phone ?? null, image: u.image ?? null } : null;
  }

  /**
   * Message pour l'API. Participants : contenu masqué si supprimé ("Message supprimé").
   * Administration (admin=true) : tout le contenu + informations de suppression.
   */
  serialize(m: RideChatMessage, opts: { viewerId?: string; admin?: boolean } = {}) {
    const hide = m.isDeleted && !opts.admin;
    return {
      id: m.id,
      rideId: m.rideId,
      type: m.type,
      text: hide ? null : m.text ?? null,
      audioUrl: hide ? null : m.audioUrl ?? null,
      audioDuration: m.audioDuration ?? null,
      audioMimeType: hide ? null : m.audioMimeType ?? null,
      audioSize: hide ? null : m.audioSize ?? null,
      senderId: m.senderId,
      senderRole: m.senderRole,
      recipientId: m.recipientId ?? null,
      ...(m.sender ? { sender: this.person(m.sender) } : {}),
      clientMessageId: m.clientMessageId ?? null,
      deliveredAt: m.deliveredAt ?? null,
      readAt: m.readAt ?? null,
      isDeleted: !!m.isDeleted,
      deletedAt: m.deletedAt ?? null,
      ...(opts.admin
        ? { deletedBy: m.deletedBy ?? null, deletedById: m.deletedById ?? null, deletedReason: m.deletedReason ?? null }
        : {}),
      ...(opts.viewerId ? { isMine: m.senderId === opts.viewerId } : {}),
      // ✅ Réponse : aperçu du message cité (contenu masqué s'il a été supprimé pour tous, sauf pour l'admin)
      replyToId: m.replyToId ?? null,
      replyTo: m.replyTo ? this.replyPreview(m.replyTo, opts) : null,
      // ✅ Administration : qui a supprimé ce message « pour lui » (le message reste visible ici)
      ...(opts.admin
        ? {
          hiddenFor: m.hiddenFor ?? [],
          hiddenForRoles: this.hiddenRoles(m),
        }
        : {}),
      createdAt: m.createdAt,
    };
  }

  /** Aperçu du message auquel on répond */
  private replyPreview(r: RideChatMessage, opts: { admin?: boolean }) {
    const hide = r.isDeleted && !opts.admin;
    return {
      id: r.id,
      type: r.type,
      text: hide ? null : r.text ?? null,
      audioDuration: r.audioDuration ?? null,
      senderId: r.senderId,
      senderRole: r.senderRole,
      isDeleted: !!r.isDeleted,
      createdAt: r.createdAt,
    };
  }

  /** Rôles (RIDER / DRIVER) des participants qui ont masqué ce message */
  private hiddenRoles(m: RideChatMessage): string[] {
    const ids = m.hiddenFor ?? [];
    if (!ids.length) return [];
    const out: string[] = [];
    if (ids.includes(m.senderId)) out.push(m.senderRole);
    if (m.recipientId && ids.includes(m.recipientId)) {
      out.push(m.senderRole === RideChatSenderRole.RIDER ? RideChatSenderRole.DRIVER : RideChatSenderRole.RIDER);
    }
    return out;
  }

  /** ✅ Masqué « pour moi » par ce participant ? */
  private hiddenForUser(m: RideChatMessage, userId: string) {
    return (m.hiddenFor ?? []).includes(userId);
  }

  /** Filtre SQL : messages que ce participant n'a pas supprimés « pour lui » */
  private notHiddenSql(alias = 'm') {
    return `(${alias}.hiddenFor IS NULL OR ${alias}.hiddenFor NOT LIKE :hiddenUid)`;
  }

  /** Message cité : doit appartenir à la même course */
  private async replyTarget(rideId: string, replyToId: string | undefined | null, lang: string): Promise<RideChatMessage | null> {
    if (!replyToId) return null;
    const target = await this.repo.findOne({ where: { id: replyToId, rideId } });
    if (!target) throw new BadRequestException(this.t('ride_chat.reply_not_found', lang));
    return target;
  }

  private rideSummary(ride: Ride) {
    return {
      id: ride.id,
      status: ride.status,
      pickupLocation: ride.pickupLocation ?? null,
      dropoffLocation: ride.dropoffLocation ?? null,
      price: ride.price != null ? Number(ride.price) : null,
      finalPrice: ride.finalPrice != null ? Number(ride.finalPrice) : null,
      currency: ride.currency ?? null,
      paymentMethod: ride.paymentMethod ?? null,
      vehicleId: ride.vehicleId ?? null,
      createdAt: ride.createdAt,
      acceptedAt: ride.acceptedAt ?? null,
      startedAt: ride.startedAt ?? null,
      completedAt: ride.completedAt ?? null,
      cancelledAt: ride.cancelledAt ?? null,
      cancelledBy: ride.cancelledBy ?? null,
      rider: this.person(ride.rider),
      driver: this.person(ride.driver),
    };
  }

  private formatDuration(sec?: number | null) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // ============================================================
  // Envoi
  // ============================================================

  private async findByClientId(rideId: string, senderId: string, clientMessageId?: string | null) {
    if (!clientMessageId) return null;
    return this.repo.findOne({ where: { rideId, senderId, clientMessageId }, relations: { sender: true, replyTo: true } });
  }

  private isDuplicate(e: any) {
    return e?.code === 'ER_DUP_ENTRY' || String(e?.message || '').includes('Duplicate');
  }

  /** ✅ Message texte (REST ou WebSocket 'ride:chat-send') */
  async sendText(rideId: string, user: UserEntity, dto: SendRideChatTextDto, lang = 'fr') {
    const text = String(dto?.text ?? '').trim();
    if (!text) throw new BadRequestException(this.t('ride_chat.empty_text', lang));
    if (text.length > 2000) throw new BadRequestException(this.t('ride_chat.text_too_long', lang, { max: 2000 }));

    const ctx = await this.context(rideId, user, lang);
    const existing = await this.findByClientId(rideId, user.id, dto.clientMessageId);
    if (existing) return { message: this.t('ride_chat.sent', lang), data: this.serialize(existing, { viewerId: user.id }) };
    this.assertWritable(ctx, lang);
    const replyTo = await this.replyTarget(rideId, dto?.replyToId, lang);

    const msg = this.repo.create({
      rideId,
      senderId: user.id,
      senderRole: ctx.role,
      recipientId: ctx.otherId,
      type: RideChatMessageType.TEXT,
      text,
      replyToId: replyTo?.id ?? null,
      clientMessageId: dto.clientMessageId || null,
      deliveredAt: ctx.otherId && this.realtime.isOnline(ctx.otherId) ? new Date() : null,
      isDeleted: false,
    });
    let saved: RideChatMessage;
    try {
      saved = await this.repo.save(msg);
    } catch (e) {
      if (this.isDuplicate(e)) {
        const dup = await this.findByClientId(rideId, user.id, dto.clientMessageId);
        if (dup) return { message: this.t('ride_chat.sent', lang), data: this.serialize(dup, { viewerId: user.id }) };
      }
      throw e;
    }
    saved.sender = user;
    saved.replyTo = replyTo;
    this.afterSend(ctx, saved, user, lang);
    return { message: this.t('ride_chat.sent', lang), data: this.serialize(saved, { viewerId: user.id }) };
  }

  private async removeTemp(file?: Express.Multer.File) {
    if (file?.path) await fs.unlink(file.path).catch(() => undefined);
  }

  /** ✅ Message vocal (multipart/form-data, champ « audio ») */
  async sendAudio(rideId: string, user: UserEntity, file: Express.Multer.File | undefined, dto: SendRideChatAudioDto, lang = 'fr') {
    if (!file) throw new BadRequestException(this.t('ride_chat.audio_required', lang));
    let uploadedUrl: string | null = null;
    try {
      const ctx = await this.context(rideId, user, lang);
      const existing = await this.findByClientId(rideId, user.id, dto?.clientMessageId);
      if (existing) {
        await this.removeTemp(file);
        return { message: this.t('ride_chat.sent', lang), data: this.serialize(existing, { viewerId: user.id }) };
      }
      this.assertWritable(ctx, lang);
      const replyTo = await this.replyTarget(rideId, dto?.replyToId, lang);
      if (file.size && file.size > this.audioMaxBytes) {
        throw new BadRequestException(
          this.t('ride_chat.audio_too_big', lang, { max: Math.round(this.audioMaxBytes / 1024 / 1024) }),
        );
      }

      const details = await this.files.uploadFileDetailed(file, 'ride-chat', { maxSize: this.audioMaxBytes });
      uploadedUrl = details.url;
      if (details.kind !== 'AUDIO') throw new BadRequestException(this.t('ride_chat.audio_invalid', lang));

      const measured = details.duration != null ? Number(details.duration) : NaN;
      const duration = Math.round(Number.isFinite(measured) && measured > 0 ? measured : Number(dto?.duration) || 0);
      if (this.audioMaxSeconds > 0 && duration > this.audioMaxSeconds + 1) {
        throw new BadRequestException(this.t('ride_chat.audio_too_long', lang, { max: this.audioMaxSeconds }));
      }

      const msg = this.repo.create({
        rideId,
        senderId: user.id,
        senderRole: ctx.role,
        recipientId: ctx.otherId,
        type: RideChatMessageType.AUDIO,
        text: null,
        audioUrl: details.url,
        audioDuration: duration || null,
        audioMimeType: details.mimeType,
        audioSize: details.size,
        replyToId: replyTo?.id ?? null,
        clientMessageId: dto?.clientMessageId || null,
        deliveredAt: ctx.otherId && this.realtime.isOnline(ctx.otherId) ? new Date() : null,
        isDeleted: false,
      });
      let saved: RideChatMessage;
      try {
        saved = await this.repo.save(msg);
      } catch (e) {
        if (this.isDuplicate(e)) {
          const dup = await this.findByClientId(rideId, user.id, dto?.clientMessageId);
          if (dup) {
            await this.files.deleteFileByUrl(uploadedUrl);
            return { message: this.t('ride_chat.sent', lang), data: this.serialize(dup, { viewerId: user.id }) };
          }
        }
        throw e;
      }
      saved.sender = user;
      saved.replyTo = replyTo;
      this.afterSend(ctx, saved, user, lang);
      return { message: this.t('ride_chat.sent', lang), data: this.serialize(saved, { viewerId: user.id }) };
    } catch (e) {
      if (uploadedUrl) await this.files.deleteFileByUrl(uploadedUrl);
      await this.removeTemp(file);
      throw e;
    }
  }

  /** Temps réel aux deux participants + push au destinataire */
  private afterSend(ctx: ChatContext, msg: RideChatMessage, sender: UserEntity, lang: string) {
    const payload = this.serialize(msg);
    this.realtime.emitToUsers([ctx.ride.riderId, ctx.ride.driverId as string], RideChatSocketEvents.MESSAGE, payload);
    void this.pushToRecipient(ctx, msg, sender, lang).catch((e) => this.logger.warn(`Push chat course : ${e?.message}`));
  }

  private async pushToRecipient(ctx: ChatContext, msg: RideChatMessage, sender: UserEntity, lang: string) {
    const to = ctx.otherId;
    if (!to || this.pushMode === 'never') return;
    if (this.pushMode === 'offline' && this.realtime.isOnline(to)) return;

    const name = sender.fullName || this.t(`ride_chat.role.${ctx.role.toLowerCase()}`, lang);
    const title = this.t(ctx.role === RideChatSenderRole.DRIVER ? 'ride_chat.push.from_driver' : 'ride_chat.push.from_rider', lang, { name });
    const body =
      msg.type === RideChatMessageType.AUDIO
        ? this.t('ride_chat.push.voice', lang, { duration: this.formatDuration(msg.audioDuration) })
        : String(msg.text || '').slice(0, 160);

    // ✅ Destinataire chauffeur → Favor Driver ; passager → application Favor Help + site web
    const channels =
      ctx.role === RideChatSenderRole.RIDER
        ? resolveChannels(NotificationType.RIDE_CHAT_MESSAGE, this.realtime.driverChannels)
        : resolveChannels(NotificationType.RIDE_CHAT_MESSAGE, this.realtime.riderChannels);

    await this.fcm.sendPushToUsers(
      [to],
      title,
      body,
      {
        type: NotificationType.RIDE_CHAT_MESSAGE,
        category: 'ride_chat',
        event: RideChatSocketEvents.MESSAGE,
        screen: 'ride_chat',
        rideId: msg.rideId,
        messageId: msg.id,
        messageType: msg.type,
        senderId: msg.senderId,
        senderRole: msg.senderRole,
        senderName: sender.fullName ?? '',
        audioDuration: msg.audioDuration ?? '',
      },
      {
        tag: `ride-chat-${msg.rideId}`,
        channels,
        ...(this.config.get<string>('RIDE_CHAT_ANDROID_CHANNEL_ID')
          ? { androidChannelId: this.config.get<string>('RIDE_CHAT_ANDROID_CHANNEL_ID') }
          : {}),
      },
    );
  }

  // ============================================================
  // Lecture (participants)
  // ============================================================

  private async unreadFor(rideId: string, userId: string) {
    return this.repo
      .createQueryBuilder('m')
      .where('m.rideId = :rideId AND m.recipientId = :uid AND m.readAt IS NULL AND m.isDeleted = 0', { rideId, uid: userId })
      .andWhere(this.notHiddenSql('m'), { hiddenUid: `%"${userId}"%` })
      .getCount();
  }

  /** ✅ Messages d'une course (du plus ancien au plus récent), pagination par curseur */
  async messages(rideId: string, user: UserEntity, query: RideChatMessagesQueryDto, lang = 'fr') {
    const ctx = await this.context(rideId, user, lang);
    const limit = Math.min(Math.max(Number(query?.limit) || 50, 1), 100);

    const qb = this.repo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.sender', 'sender')
      .leftJoinAndSelect('m.replyTo', 'replyTo')
      .where('m.rideId = :rideId', { rideId })
      // ✅ Les messages supprimés « pour moi » ne sont plus renvoyés à ce participant
      .andWhere(this.notHiddenSql('m'), { hiddenUid: `%"${user.id}"%` });
    if (query?.before) qb.andWhere('m.createdAt < :before', { before: new Date(query.before) });
    if (query?.after) qb.andWhere('m.createdAt > :after', { after: new Date(query.after) });

    let rows: RideChatMessage[];
    let hasMore: boolean;
    if (query?.after && !query?.before) {
      rows = await qb.orderBy('m.createdAt', 'ASC').take(limit + 1).getMany();
      hasMore = rows.length > limit;
      rows = rows.slice(0, limit);
    } else {
      rows = await qb.orderBy('m.createdAt', 'DESC').take(limit + 1).getMany();
      hasMore = rows.length > limit;
      rows = rows.slice(0, limit).reverse();
    }

    return {
      message: this.t('ride_chat.messages', lang),
      data: {
        ride: this.rideSummary(ctx.ride),
        me: { id: user.id, role: ctx.role },
        participants: { rider: this.person(ctx.ride.rider), driver: this.person(ctx.ride.driver) },
        canWrite: this.canWrite(ctx.ride),
        unreadCount: await this.unreadFor(rideId, user.id),
        hasMore,
        messages: rows.map((m) => this.serialize(m, { viewerId: user.id })),
      },
    };
  }

  /** ✅ Marquer comme lus tous les messages reçus dans cette course */
  async markRead(rideId: string, user: UserEntity, lang = 'fr') {
    const ctx = await this.context(rideId, user, lang);
    const now = new Date();
    await this.repo
      .createQueryBuilder()
      .update(RideChatMessage)
      .set({ deliveredAt: now })
      .where('rideId = :rideId AND recipientId = :uid AND deliveredAt IS NULL', { rideId, uid: user.id })
      .execute();
    const res = await this.repo
      .createQueryBuilder()
      .update(RideChatMessage)
      .set({ readAt: now })
      .where('rideId = :rideId AND recipientId = :uid AND readAt IS NULL', { rideId, uid: user.id })
      .execute();
    const count = Number(res.affected || 0);
    if (count && ctx.otherId) {
      this.realtime.emitToUsers([ctx.otherId, user.id], RideChatSocketEvents.READ, {
        rideId,
        readerId: user.id,
        readAt: now.toISOString(),
        count,
      });
    }
    return { message: this.t('ride_chat.read', lang), data: { rideId, count, readAt: now } };
  }

  /** ✅ Messages non lus : total + par course */
  async unread(user: UserEntity, lang = 'fr') {
    const rows = await this.repo
      .createQueryBuilder('m')
      .select('m.rideId', 'rideId')
      .addSelect('COUNT(*)', 'count')
      .where('m.recipientId = :uid AND m.readAt IS NULL AND m.isDeleted = 0', { uid: user.id })
      .groupBy('m.rideId')
      .getRawMany();
    const byRide = rows.map((r) => ({ rideId: r.rideId, count: Number(r.count) }));
    return {
      message: this.t('ride_chat.unread', lang),
      data: { total: byRide.reduce((s, r) => s + r.count, 0), byRide },
    };
  }

  /** ✅ Mes conversations (passager ou chauffeur), les plus récentes d'abord */
  async myConversations(user: UserEntity, query: MyRideChatsQueryDto, lang = 'fr') {
    const page = Math.max(Number(query?.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query?.limit) || 20, 1), 50);

    const base = () =>
      this.repo
        .createQueryBuilder('m')
        .innerJoin(Ride, 'r', 'r.id = m.rideId')
        .where('(r.riderId = :uid OR r.driverId = :uid)', { uid: user.id });

    const totalRow = await base().select('COUNT(DISTINCT m.rideId)', 'n').getRawOne();
    const rows = await base()
      .select('m.rideId', 'rideId')
      .addSelect('MAX(m.createdAt)', 'lastMessageAt')
      .addSelect('COUNT(*)', 'messageCount')
      .addSelect('SUM(CASE WHEN m.recipientId = :uid AND m.readAt IS NULL AND m.isDeleted = 0 THEN 1 ELSE 0 END)', 'unread')
      .groupBy('m.rideId')
      .orderBy('MAX(m.createdAt)', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    const items = await this.hydrateConversations(rows, { viewerId: user.id });
    return {
      message: this.t('ride_chat.conversations', lang),
      data: items,
      meta: { total: Number(totalRow?.n || 0), page, limit },
    };
  }

  /** Complète les lignes agrégées : course, participants, dernier message */
  private async hydrateConversations(rows: any[], opts: { viewerId?: string; admin?: boolean }) {
    const ids = rows.map((r) => r.rideId).filter(Boolean);
    if (!ids.length) return [];
    const rides = await this.rideRepo.find({ where: { id: In(ids) }, relations: { rider: true, driver: true } });
    const byId = new Map<string, Ride>(rides.map((r) => [r.id, r] as [string, Ride]));
    const lasts = await Promise.all(
      ids.map((rideId) => {
        const qb = this.repo
          .createQueryBuilder('m')
          .leftJoinAndSelect('m.sender', 'sender')
          .where('m.rideId = :rideId', { rideId });
        if (opts.viewerId && !opts.admin) qb.andWhere(this.notHiddenSql('m'), { hiddenUid: `%"${opts.viewerId}"%` });
        return qb.orderBy('m.createdAt', 'DESC').getOne();
      }),
    );
    return rows.map((r, i) => {
      const ride = byId.get(r.rideId);
      const last = lasts[i];
      return {
        rideId: r.rideId,
        ride: ride ? this.rideSummary(ride) : null,
        ...(opts.viewerId && ride
          ? {
            myRole: ride.driverId === opts.viewerId ? RideChatSenderRole.DRIVER : RideChatSenderRole.RIDER,
            otherParticipant: this.person(ride.driverId === opts.viewerId ? ride.rider : ride.driver),
            canWrite: this.canWrite(ride),
          }
          : {}),
        lastMessage: last ? this.serialize(last, opts) : null,
        lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt) : null,
        messageCount: Number(r.messageCount || 0),
        ...(r.unread != null ? { unreadCount: Number(r.unread || 0) } : {}),
        ...(opts.admin
          ? {
            firstMessageAt: r.firstMessageAt ? new Date(r.firstMessageAt) : null,
            textCount: Number(r.textCount || 0),
            audioCount: Number(r.audioCount || 0),
            audioSeconds: Number(r.audioSeconds || 0),
            deletedCount: Number(r.deletedCount || 0),
            riderMessages: Number(r.riderMessages || 0),
            driverMessages: Number(r.driverMessages || 0),
          }
          : {}),
      };
    });
  }

  /**
   * ✅ Suppression par un participant (comme le chat du back-office) :
   *  - forEveryone=true  (défaut) : SON message, dans le délai RIDE_CHAT_DELETE_MINUTES → « Message supprimé » pour les deux ;
   *  - forEveryone=false : N'IMPORTE QUEL message de la conversation disparaît SEULEMENT pour lui
   *    (l'autre participant le voit toujours).
   * Dans les deux cas le message est conservé : l'administration voit tout (contenu + qui l'a supprimé / masqué).
   */
  async deleteOwn(rideId: string, messageId: string, user: UserEntity, lang = 'fr', forEveryone = true) {
    if (!forEveryone) return this.hideForMe(rideId, messageId, user, lang);
    const ctx = await this.context(rideId, user, lang);
    const msg = await this.repo.findOne({ where: { id: messageId, rideId } });
    if (!msg) throw new NotFoundException(this.t('ride_chat.message_not_found', lang));
    if (msg.senderId !== user.id) throw new ForbiddenException(this.t('ride_chat.not_your_message', lang));
    if (msg.isDeleted) throw new BadRequestException(this.t('ride_chat.already_deleted', lang));
    if (this.deleteMinutes > 0 && Date.now() - new Date(msg.createdAt).getTime() > this.deleteMinutes * 60 * 1000) {
      throw new BadRequestException(this.t('ride_chat.delete_too_late', lang, { minutes: this.deleteMinutes }));
    }
    msg.isDeleted = true;
    msg.deletedAt = new Date();
    msg.deletedById = user.id;
    msg.deletedBy = 'SENDER';
    await this.repo.save(msg);
    this.realtime.emitToUsers([ctx.ride.riderId, ctx.ride.driverId as string], RideChatSocketEvents.DELETED, {
      rideId,
      messageId,
      deletedBy: 'SENDER',
      deletedAt: msg.deletedAt,
    });
    return { message: this.t('ride_chat.deleted', lang), data: this.serialize(msg, { viewerId: user.id }) };
  }

  /** ✅ « Supprimer pour moi » : le message disparaît seulement pour ce participant */
  async hideForMe(rideId: string, messageId: string, user: UserEntity, lang = 'fr') {
    await this.context(rideId, user, lang); // participant de la course (passager / chauffeur)
    const msg = await this.repo.findOne({ where: { id: messageId, rideId } });
    if (!msg) throw new NotFoundException(this.t('ride_chat.message_not_found', lang));
    if (!this.hiddenForUser(msg, user.id)) {
      msg.hiddenFor = [...new Set([...(msg.hiddenFor ?? []), user.id])];
      // Un message reçu et masqué ne compte plus comme non lu
      if (msg.recipientId === user.id && !msg.readAt) msg.readAt = new Date();
      await this.repo.save(msg);
    }
    // Seulement ses propres appareils (l'autre participant n'est pas prévenu)
    this.realtime.emitToUser(user.id, RideChatSocketEvents.HIDDEN, { rideId, messageId });
    return { message: this.t('ride_chat.hidden', lang), data: { rideId, messageId, hidden: true } };
  }

  /** ✅ « En train d'écrire / d'enregistrer » (WebSocket) : relayé à l'autre participant */
  async typing(rideId: string, user: UserEntity, state: { typing?: boolean; recording?: boolean }) {
    const ctx = await this.context(rideId, user, 'fr');
    if (!ctx.otherId) return { rideId };
    this.realtime.emitToUser(ctx.otherId, RideChatSocketEvents.TYPING, {
      rideId,
      userId: user.id,
      role: ctx.role,
      typing: !!state?.typing,
      recording: !!state?.recording,
      at: new Date().toISOString(),
    });
    return { rideId };
  }

  // ============================================================
  // ADMINISTRATION : historique des conversations
  // ============================================================

  private applyAdminFilters(qb: SelectQueryBuilder<RideChatMessage>, q: AdminRideChatConversationsQueryDto) {
    if (q?.rideId) qb.andWhere('m.rideId = :rideId', { rideId: q.rideId });
    if (q?.driverId) qb.andWhere('r.driverId = :driverId', { driverId: q.driverId });
    if (q?.riderId) qb.andWhere('r.riderId = :riderId', { riderId: q.riderId });
    if (q?.status) qb.andWhere('r.status = :status', { status: q.status });
    if (q?.search) {
      const s = `%${q.search}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('ru.fullName LIKE :s', { s })
            .orWhere('ru.phone LIKE :s', { s })
            .orWhere('ru.email LIKE :s', { s })
            .orWhere('du.fullName LIKE :s', { s })
            .orWhere('du.phone LIKE :s', { s })
            .orWhere('du.email LIKE :s', { s })
            .orWhere('r.id LIKE :s', { s })
            .orWhere('m.rideId IN (SELECT m2.rideId FROM ride_chat_messages m2 WHERE m2.text LIKE :s)', { s });
        }),
      );
    }
    const having: string[] = [];
    const params: Record<string, any> = {};
    if (q?.hasAudio === true) having.push("SUM(CASE WHEN m.type = 'AUDIO' THEN 1 ELSE 0 END) > 0");
    if (q?.hasAudio === false) having.push("SUM(CASE WHEN m.type = 'AUDIO' THEN 1 ELSE 0 END) = 0");
    if (q?.hasDeleted === true) having.push('SUM(m.isDeleted) > 0');
    if (q?.hasDeleted === false) having.push('SUM(m.isDeleted) = 0');
    if (q?.from) {
      having.push('MAX(m.createdAt) >= :from');
      params.from = new Date(q.from);
    }
    if (q?.to) {
      having.push('MAX(m.createdAt) <= :to');
      params.to = new Date(q.to);
    }
    if (having.length) qb.having(having.join(' AND '), params);
    return qb;
  }

  /** ✅ Admin : liste des conversations (une par course) */
  async adminConversations(q: AdminRideChatConversationsQueryDto, lang = 'fr') {
    const page = Math.max(Number(q?.page) || 1, 1);
    const limit = Math.min(Math.max(Number(q?.limit) || 20, 1), 100);

    const build = () =>
      this.applyAdminFilters(
        this.repo
          .createQueryBuilder('m')
          .innerJoin(Ride, 'r', 'r.id = m.rideId')
          .leftJoin(UserEntity, 'ru', 'ru.id = r.riderId')
          .leftJoin(UserEntity, 'du', 'du.id = r.driverId')
          .select('m.rideId', 'rideId')
          .addSelect('MAX(m.createdAt)', 'lastMessageAt')
          .addSelect('MIN(m.createdAt)', 'firstMessageAt')
          .addSelect('COUNT(*)', 'messageCount')
          .addSelect("SUM(CASE WHEN m.type = 'TEXT' THEN 1 ELSE 0 END)", 'textCount')
          .addSelect("SUM(CASE WHEN m.type = 'AUDIO' THEN 1 ELSE 0 END)", 'audioCount')
          .addSelect('COALESCE(SUM(m.audioDuration), 0)', 'audioSeconds')
          .addSelect('SUM(m.isDeleted)', 'deletedCount')
          .addSelect("SUM(CASE WHEN m.senderRole = 'RIDER' THEN 1 ELSE 0 END)", 'riderMessages')
          .addSelect("SUM(CASE WHEN m.senderRole = 'DRIVER' THEN 1 ELSE 0 END)", 'driverMessages')
          .groupBy('m.rideId'),
        q,
      );

    const grouped = build();
    const countRow = await this.repo.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'n')
      .from(`(${grouped.getQuery()})`, 't')
      .setParameters(grouped.getParameters())
      .getRawOne();

    const rows = await build()
      .orderBy('MAX(m.createdAt)', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    const total = Number(countRow?.n || 0);
    return {
      message: this.t('ride_chat.conversations', lang),
      data: await this.hydrateConversations(rows, { admin: true }),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /** ✅ Admin : une conversation complète (course, participants, messages du plus ancien au plus récent) */
  async adminConversation(rideId: string, q: AdminRideChatMessagesQueryDto, lang = 'fr') {
    const ride = await this.rideRepo.findOne({ where: { id: rideId }, relations: { rider: true, driver: true } });
    if (!ride) throw new NotFoundException(this.t('ride.ride_not_found', lang));
    const page = Math.max(Number(q?.page) || 1, 1);
    const limit = Math.min(Math.max(Number(q?.limit) || 100, 1), 200);

    // ✅ L'administration voit TOUT : messages supprimés pour tous ET supprimés « pour moi »
    const qb = this.repo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.sender', 'sender')
      .leftJoinAndSelect('m.replyTo', 'replyTo')
      .where('m.rideId = :rideId', { rideId });
    if (q?.type) qb.andWhere('m.type = :type', { type: q.type });
    if (q?.includeDeleted === false) qb.andWhere('m.isDeleted = 0');
    const [rows, total] = await qb
      .orderBy('m.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const summary = await this.repo
      .createQueryBuilder('m')
      .select('COUNT(*)', 'messageCount')
      .addSelect("SUM(CASE WHEN m.type = 'TEXT' THEN 1 ELSE 0 END)", 'textCount')
      .addSelect("SUM(CASE WHEN m.type = 'AUDIO' THEN 1 ELSE 0 END)", 'audioCount')
      .addSelect('COALESCE(SUM(m.audioDuration), 0)', 'audioSeconds')
      .addSelect('SUM(m.isDeleted)', 'deletedCount')
      .addSelect("SUM(CASE WHEN m.hiddenFor IS NOT NULL AND m.hiddenFor <> '[]' THEN 1 ELSE 0 END)", 'hiddenCount')
      .addSelect('SUM(CASE WHEN m.replyToId IS NOT NULL THEN 1 ELSE 0 END)', 'replyCount')
      .addSelect("SUM(CASE WHEN m.senderRole = 'RIDER' THEN 1 ELSE 0 END)", 'riderMessages')
      .addSelect("SUM(CASE WHEN m.senderRole = 'DRIVER' THEN 1 ELSE 0 END)", 'driverMessages')
      .addSelect('MIN(m.createdAt)', 'firstMessageAt')
      .addSelect('MAX(m.createdAt)', 'lastMessageAt')
      .where('m.rideId = :rideId', { rideId })
      .getRawOne();

    return {
      message: this.t('ride_chat.conversation', lang),
      data: {
        ride: this.rideSummary(ride),
        participants: { rider: this.person(ride.rider), driver: this.person(ride.driver) },
        canWrite: this.canWrite(ride),
        summary: {
          messageCount: Number(summary?.messageCount || 0),
          textCount: Number(summary?.textCount || 0),
          audioCount: Number(summary?.audioCount || 0),
          audioSeconds: Number(summary?.audioSeconds || 0),
          deletedCount: Number(summary?.deletedCount || 0),
          hiddenCount: Number(summary?.hiddenCount || 0),
          replyCount: Number(summary?.replyCount || 0),
          riderMessages: Number(summary?.riderMessages || 0),
          driverMessages: Number(summary?.driverMessages || 0),
          firstMessageAt: summary?.firstMessageAt ? new Date(summary.firstMessageAt) : null,
          lastMessageAt: summary?.lastMessageAt ? new Date(summary.lastMessageAt) : null,
        },
        messages: rows.map((m) => this.serialize(m, { admin: true })),
      },
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  /** ✅ Admin : un message (avec la course) */
  async adminMessage(messageId: string, lang = 'fr') {
    const msg = await this.repo.findOne({ where: { id: messageId }, relations: { sender: true, replyTo: true } });
    if (!msg) throw new NotFoundException(this.t('ride_chat.message_not_found', lang));
    return { message: this.t('ride_chat.conversation', lang), data: this.serialize(msg, { admin: true }) };
  }

  /** ✅ Admin : statistiques du chat (période optionnelle) */
  async adminStats(q: AdminRideChatStatsQueryDto, lang = 'fr') {
    const from = q?.from ? new Date(q.from) : null;
    const to = q?.to ? new Date(q.to) : null;
    const scope = (qb: SelectQueryBuilder<RideChatMessage>) => {
      if (from) qb.andWhere('m.createdAt >= :from', { from });
      if (to) qb.andWhere('m.createdAt <= :to', { to });
      return qb;
    };

    const totals = await scope(
      this.repo
        .createQueryBuilder('m')
        .select('COUNT(*)', 'messages')
        .addSelect('COUNT(DISTINCT m.rideId)', 'conversations')
        .addSelect("SUM(CASE WHEN m.type = 'TEXT' THEN 1 ELSE 0 END)", 'text')
        .addSelect("SUM(CASE WHEN m.type = 'AUDIO' THEN 1 ELSE 0 END)", 'audio')
        .addSelect('COALESCE(SUM(m.audioDuration), 0)', 'audioSeconds')
        .addSelect('SUM(m.isDeleted)', 'deleted')
        .addSelect("SUM(CASE WHEN m.senderRole = 'RIDER' THEN 1 ELSE 0 END)", 'fromRiders')
        .addSelect("SUM(CASE WHEN m.senderRole = 'DRIVER' THEN 1 ELSE 0 END)", 'fromDrivers')
        .addSelect('SUM(CASE WHEN m.readAt IS NULL THEN 1 ELSE 0 END)', 'unread')
        .where('1 = 1'),
    ).getRawOne();

    const perDay = await scope(
      this.repo
        .createQueryBuilder('m')
        .select('DATE(m.createdAt)', 'day')
        .addSelect('COUNT(*)', 'messages')
        .addSelect("SUM(CASE WHEN m.type = 'AUDIO' THEN 1 ELSE 0 END)", 'audio')
        .addSelect('COUNT(DISTINCT m.rideId)', 'conversations')
        .where(from ? '1 = 1' : 'm.createdAt >= :since', from ? {} : { since: new Date(Date.now() - 30 * 24 * 3600 * 1000) }),
    )
      .groupBy('DATE(m.createdAt)')
      .orderBy('DATE(m.createdAt)', 'ASC')
      .getRawMany();

    const n = (v: any) => Number(v || 0);
    return {
      message: this.t('ride_chat.stats', lang),
      data: {
        period: { from, to },
        messages: n(totals?.messages),
        conversations: n(totals?.conversations),
        text: n(totals?.text),
        audio: n(totals?.audio),
        audioSeconds: n(totals?.audioSeconds),
        deleted: n(totals?.deleted),
        fromRiders: n(totals?.fromRiders),
        fromDrivers: n(totals?.fromDrivers),
        unread: n(totals?.unread),
        perDay: perDay.map((d) => ({
          day: d.day instanceof Date ? d.day.toISOString().slice(0, 10) : String(d.day).slice(0, 10),
          messages: n(d.messages),
          audio: n(d.audio),
          conversations: n(d.conversations),
        })),
      },
    };
  }

  /** ✅ Admin (modération) : masquer un message aux participants — conservé dans l'historique */
  async adminDelete(messageId: string, admin: UserEntity, reason: string | undefined, lang = 'fr') {
    const msg = await this.repo.findOne({ where: { id: messageId }, relations: { sender: true, replyTo: true } });
    if (!msg) throw new NotFoundException(this.t('ride_chat.message_not_found', lang));
    if (msg.isDeleted) throw new BadRequestException(this.t('ride_chat.already_deleted', lang));
    msg.isDeleted = true;
    msg.deletedAt = new Date();
    msg.deletedById = admin.id;
    msg.deletedBy = 'ADMIN';
    msg.deletedReason = reason?.trim() || null;
    await this.repo.save(msg);
    await this.notifyParticipants(msg.rideId, RideChatSocketEvents.DELETED, {
      rideId: msg.rideId,
      messageId: msg.id,
      deletedBy: 'ADMIN',
      deletedAt: msg.deletedAt,
    });
    return { message: this.t('ride_chat.deleted', lang), data: this.serialize(msg, { admin: true }) };
  }

  /** ✅ Admin : rétablir un message supprimé */
  async adminRestore(messageId: string, lang = 'fr') {
    const msg = await this.repo.findOne({ where: { id: messageId }, relations: { sender: true, replyTo: true } });
    if (!msg) throw new NotFoundException(this.t('ride_chat.message_not_found', lang));
    if (!msg.isDeleted) throw new BadRequestException(this.t('ride_chat.not_deleted', lang));
    msg.isDeleted = false;
    msg.deletedAt = null;
    msg.deletedById = null;
    msg.deletedBy = null;
    msg.deletedReason = null;
    await this.repo.save(msg);
    await this.notifyParticipants(msg.rideId, RideChatSocketEvents.RESTORED, this.serialize(msg));
    return { message: this.t('ride_chat.restored', lang), data: this.serialize(msg, { admin: true }) };
  }

  private async notifyParticipants(rideId: string, event: string, payload: any) {
    const ride = await this.rideRepo.findOne({ where: { id: rideId }, select: { id: true, riderId: true, driverId: true } });
    if (ride) this.realtime.emitToUsers([ride.riderId, ride.driverId as string], event, payload);
  }
}
