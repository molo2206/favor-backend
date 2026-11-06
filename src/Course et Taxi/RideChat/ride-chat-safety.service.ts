import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Ride } from 'src/Course et Taxi/Ride/entity/Ride.entity';
import { RideRealtimeService } from 'src/Course et Taxi/Ride/ride-realtime.service';
import { UserEntity } from 'src/users/entities/user.entity';
import { I18nService } from 'src/libs/common/src';
import { RideChatMessage, RideChatSenderRole } from './entity/ride-chat-message.entity';
import { RideChatBlock, RideChatReport, RideChatReportReason, RideChatReportStatus } from './entity/ride-chat-safety.entity';
import {
  AdminReviewRideChatReportDto,
  AdminRideChatReportsQueryDto,
  BlockRideChatUserDto,
  ReportRideChatDto,
} from './dto/ride-chat.dto';
import { RideChatSocketEvents } from './ride-chat.events';

export type BlockState = { blockedByMe: boolean; blockedMe: boolean };

/**
 * ✅ Sécurité du chat de course (exigence Apple, règle 1.2 « contenu généré par les utilisateurs ») :
 *  - signaler un message ou un utilisateur (motif obligatoire, précisions obligatoires pour « Autre ») ;
 *  - bloquer / débloquer un utilisateur : envoi refusé dans les deux sens (403), messages du bloqué masqués,
 *    « écrit… » plus relayé ;
 *  - modération par l'administration (signalements à traiter sous 24 h, masquage du message signalé).
 */
@Injectable()
export class RideChatSafetyService {
  private readonly logger = new Logger(RideChatSafetyService.name);

  constructor(
    @InjectRepository(RideChatReport) private readonly reports: Repository<RideChatReport>,
    @InjectRepository(RideChatBlock) private readonly blocks: Repository<RideChatBlock>,
    @InjectRepository(RideChatMessage) private readonly messages: Repository<RideChatMessage>,
    @InjectRepository(Ride) private readonly rideRepo: Repository<Ride>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    private readonly realtime: RideRealtimeService,
    private readonly i18n: I18nService,
  ) { }

  private t(key: string, lang = 'fr', params?: Record<string, any>) {
    return this.i18n.translate(key, lang, params);
  }

  private person(u?: UserEntity | null) {
    return u ? { id: u.id, fullName: u.fullName ?? null, phone: u.phone ?? null, image: u.image ?? null } : null;
  }

  // ============================================================
  // BLOCAGE
  // ============================================================

  /** État de blocage entre l'utilisateur et l'autre participant */
  async state(userId: string, otherId?: string | null): Promise<BlockState> {
    if (!otherId || otherId === userId) return { blockedByMe: false, blockedMe: false };
    const rows = await this.blocks.find({
      where: [
        { blockerId: userId, blockedId: otherId },
        { blockerId: otherId, blockedId: userId },
      ],
    });
    return {
      blockedByMe: rows.some((r) => r.blockerId === userId),
      blockedMe: rows.some((r) => r.blockerId === otherId),
    };
  }

  /** Blocage dans un sens ou dans l'autre ? */
  async isBlockedEitherWay(a: string, b?: string | null): Promise<boolean> {
    const s = await this.state(a, b);
    return s.blockedByMe || s.blockedMe;
  }

  /** ✅ Refuse l'envoi (403) si l'un des deux a bloqué l'autre */
  async assertCanMessage(userId: string, otherId: string | null | undefined, lang = 'fr') {
    const s = await this.state(userId, otherId);
    if (s.blockedByMe) throw new ForbiddenException(this.t('ride_chat.blocked_by_me', lang));
    if (s.blockedMe) throw new ForbiddenException(this.t('ride_chat.blocked_me', lang));
  }

  /** Utilisateurs bloqués par userId (pour masquer leurs messages) */
  async blockedIdsOf(userId: string): Promise<string[]> {
    const rows = await this.blocks.find({ where: { blockerId: userId }, select: { blockedId: true } as any });
    return rows.map((r) => r.blockedId);
  }

  private notifyBlock(blockerId: string, blockedId: string, blocked: boolean) {
    // Mes appareils : mise à jour de l'écran ; l'autre : saisie désactivée / réactivée
    this.realtime.emitToUser(blockerId, RideChatSocketEvents.BLOCK_UPDATED, { userId: blockedId, blockedByMe: blocked });
    this.realtime.emitToUser(blockedId, RideChatSocketEvents.BLOCK_UPDATED, { userId: blockerId, blockedMe: blocked });
  }

  async block(user: UserEntity, otherId: string, dto: BlockRideChatUserDto = {}, lang = 'fr') {
    if (otherId === user.id) throw new BadRequestException(this.t('ride_chat.cannot_block_self', lang));
    const other = await this.userRepo.findOne({ where: { id: otherId } });
    if (!other) throw new NotFoundException(this.t('ride_chat.user_not_found', lang));
    let row = await this.blocks.findOne({ where: { blockerId: user.id, blockedId: otherId } });
    if (!row) {
      try {
        row = await this.blocks.save(
          this.blocks.create({ blockerId: user.id, blockedId: otherId, rideId: dto.rideId ?? null, reason: dto.reason ?? null }),
        );
      } catch (e: any) {
        // double clic : la paire existe déjà
        row = await this.blocks.findOne({ where: { blockerId: user.id, blockedId: otherId } });
        if (!row) throw e;
      }
    }
    this.notifyBlock(user.id, otherId, true);
    return {
      message: this.t('ride_chat.user_blocked', lang, { name: other.fullName || '' }),
      data: { userId: otherId, user: this.person(other), ...(await this.state(user.id, otherId)), blockedAt: row.createdAt },
    };
  }

  async unblock(user: UserEntity, otherId: string, lang = 'fr') {
    await this.blocks.delete({ blockerId: user.id, blockedId: otherId });
    this.notifyBlock(user.id, otherId, false);
    return {
      message: this.t('ride_chat.user_unblocked', lang),
      data: { userId: otherId, ...(await this.state(user.id, otherId)) },
    };
  }

  async blockStatus(user: UserEntity, otherId: string, lang = 'fr') {
    return { message: this.t('ride_chat.block_status', lang), data: { userId: otherId, ...(await this.state(user.id, otherId)) } };
  }

  /** Mes utilisateurs bloqués */
  async myBlocks(user: UserEntity, lang = 'fr') {
    const rows = await this.blocks.find({ where: { blockerId: user.id }, relations: { blocked: true }, order: { createdAt: 'DESC' } });
    return {
      message: this.t('ride_chat.blocks', lang),
      data: rows.map((r) => ({ userId: r.blockedId, user: this.person(r.blocked), rideId: r.rideId ?? null, blockedAt: r.createdAt })),
    };
  }

  // ============================================================
  // SIGNALEMENT
  // ============================================================

  async report(rideId: string, user: UserEntity, dto: ReportRideChatDto, lang = 'fr') {
    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) throw new NotFoundException(this.t('ride.ride_not_found', lang));
    const role =
      ride.driverId && ride.driverId === user.id ? RideChatSenderRole.DRIVER : ride.riderId === user.id ? RideChatSenderRole.RIDER : null;
    if (!role) throw new ForbiddenException(this.t('ride.forbidden', lang));
    const otherId = role === RideChatSenderRole.DRIVER ? ride.riderId : ride.driverId ?? null;

    if (dto.reason === RideChatReportReason.OTHER && !String(dto.details ?? '').trim()) {
      throw new BadRequestException(this.t('ride_chat.report_details_required', lang));
    }

    let msg: RideChatMessage | null = null;
    if (dto.messageId) {
      msg = await this.messages.findOne({ where: { id: dto.messageId, rideId } });
      if (!msg) throw new NotFoundException(this.t('ride_chat.message_not_found', lang));
      if (msg.senderId === user.id) throw new BadRequestException(this.t('ride_chat.cannot_report_own', lang));
    }
    const reportedUserId = msg?.senderId ?? otherId;
    if (!reportedUserId) throw new BadRequestException(this.t('ride_chat.no_driver', lang));

    // Même message déjà signalé par la même personne : on renvoie le signalement existant
    if (msg) {
      const dup = await this.reports.findOne({ where: { messageId: msg.id, reporterId: user.id } });
      if (dup) {
        if (dto.block) await this.block(user, reportedUserId, { rideId }, lang);
        return { message: this.t('ride_chat.reported', lang), data: { ...this.serializeReport(dup), ...(await this.state(user.id, reportedUserId)) } };
      }
    }

    const saved = await this.reports.save(
      this.reports.create({
        rideId,
        messageId: msg?.id ?? null,
        reporterId: user.id,
        reporterRole: role,
        reportedUserId,
        reason: dto.reason as RideChatReportReason,
        details: dto.details?.trim() || null,
        messageSnapshot: msg
          ? {
            id: msg.id,
            type: msg.type,
            text: msg.text ?? null,
            audioUrl: msg.audioUrl ?? null,
            audioDuration: msg.audioDuration ?? null,
            senderId: msg.senderId,
            senderRole: msg.senderRole,
            createdAt: msg.createdAt,
          }
          : null,
        alsoBlocked: !!dto.block,
        status: RideChatReportStatus.PENDING,
      }),
    );
    if (dto.block) await this.block(user, reportedUserId, { rideId, reason: `REPORT:${dto.reason}` }, lang);
    this.logger.warn(`Signalement chat ${saved.id} : course ${rideId}, motif ${dto.reason}, signalé ${reportedUserId}`);

    return {
      message: this.t('ride_chat.reported', lang),
      data: { ...this.serializeReport(saved), ...(await this.state(user.id, reportedUserId)) },
    };
  }

  serializeReport(r: RideChatReport, admin = false) {
    return {
      id: r.id,
      rideId: r.rideId,
      messageId: r.messageId ?? null,
      reason: r.reason,
      details: r.details ?? null,
      status: r.status,
      alsoBlocked: !!r.alsoBlocked,
      reportedUserId: r.reportedUserId,
      createdAt: r.createdAt,
      ...(admin
        ? {
          reporterId: r.reporterId,
          reporterRole: r.reporterRole,
          reporter: this.person(r.reporter),
          reportedUser: this.person(r.reportedUser),
          messageSnapshot: r.messageSnapshot ?? null,
          adminNote: r.adminNote ?? null,
          reviewedById: r.reviewedById ?? null,
          reviewedAt: r.reviewedAt ?? null,
        }
        : {}),
    };
  }

  // ============================================================
  // ADMINISTRATION
  // ============================================================

  async adminReports(q: AdminRideChatReportsQueryDto, lang = 'fr') {
    const page = Math.max(Number(q?.page) || 1, 1);
    const limit = Math.min(Math.max(Number(q?.limit) || 20, 1), 100);
    const where: any = {};
    if (q?.status) where.status = q.status;
    if (q?.reason) where.reason = q.reason;
    if (q?.rideId) where.rideId = q.rideId;
    if (q?.reportedUserId) where.reportedUserId = q.reportedUserId;
    const [rows, total] = await this.reports.findAndCount({
      where,
      relations: { reporter: true, reportedUser: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const pending = await this.reports.count({ where: { status: RideChatReportStatus.PENDING } });
    // Nombre de signalements reçus par chaque utilisateur signalé (récidive)
    const ids = [...new Set(rows.map((r) => r.reportedUserId))];
    const counts = ids.length
      ? await this.reports
        .createQueryBuilder('r')
        .select('r.reportedUserId', 'id')
        .addSelect('COUNT(*)', 'n')
        .where('r.reportedUserId IN (:...ids)', { ids })
        .groupBy('r.reportedUserId')
        .getRawMany()
      : [];
    const countOf = new Map(counts.map((c: any) => [c.id, Number(c.n)]));
    return {
      message: this.t('ride_chat.reports', lang),
      data: rows.map((r) => ({ ...this.serializeReport(r, true), reportsAgainstUser: countOf.get(r.reportedUserId) ?? 1 })),
      meta: { total, page, limit, pending },
    };
  }

  reviewedMessage(lang = 'fr') {
    return this.t('ride_chat.report_reviewed', lang);
  }

  /** Traite le signalement ; renvoie l'id du message à masquer si demandé */
  async adminReview(id: string, dto: AdminReviewRideChatReportDto, admin: UserEntity, lang = 'fr') {
    const report = await this.reports.findOne({ where: { id }, relations: { reporter: true, reportedUser: true } });
    if (!report) throw new NotFoundException(this.t('ride_chat.report_not_found', lang));
    report.status = dto.status as RideChatReportStatus;
    if (dto.adminNote !== undefined) report.adminNote = dto.adminNote || null;
    report.reviewedById = admin.id;
    report.reviewedAt = new Date();
    const saved = await this.reports.save(report);
    return { report: saved, hideMessageId: dto.hideMessage && saved.messageId ? saved.messageId : null };
  }
}
