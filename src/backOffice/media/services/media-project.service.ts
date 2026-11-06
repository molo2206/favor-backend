import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Brackets, EntityManager, In, MoreThanOrEqual, Not } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { NotificationType } from 'src/notification/type/notification.type';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { pageParams, reference } from 'src/backOffice/logistics/common/logistics-access';
import {
  MEDIA_PROJECT_TRANSITIONS,
  MediaEventType,
  MediaPaymentMethod,
  MediaPaymentStatus,
  MediaProjectKind,
  MediaProjectStatus,
  MediaSessionStatus,
  MediaUnit,
} from '../media.enums';
import { MediaProject } from '../entities/media-project.entity';
import { MediaProjectItem } from '../entities/media-project-item.entity';
import { MediaServiceEntity } from '../entities/media-service.entity';
import { MediaPayment } from '../entities/media-payment.entity';
import { MediaProjectEvent } from '../entities/media-project-event.entity';
import { MediaSession } from '../entities/media-session.entity';
import { MediaFile } from '../entities/media-file.entity';
import {
  AddMediaPaymentDto,
  ChangeProjectStatusDto,
  CreateMediaProjectDto,
  MediaItemInputDto,
  MediaProjectQueryDto,
  ProjectNoteDto,
  ShareProjectDto,
  UpdateMediaProjectDto,
} from '../dto/media.dto';
import { MediaCommonService } from './media-common.service';

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

/** Projets / commandes média : devis, cycle, paiements, livraison, tableau de bord */
@Injectable()
export class MediaProjectService {
  constructor(private readonly common: MediaCommonService) { }

  private get m() {
    return this.common.dataSource.manager;
  }

  // ============================================================
  // OUTILS
  // ============================================================

  /** Lignes du devis : reprend prix / unité / libellé de la prestation si absents */
  private async buildItems(m: EntityManager, companyId: string, items: MediaItemInputDto[], lang: string) {
    const out: Partial<MediaProjectItem>[] = [];
    let position = 0;
    for (const it of items) {
      let service: MediaServiceEntity | null = null;
      if (it.serviceId) {
        service = await m.findOne(MediaServiceEntity, { where: { id: it.serviceId } });
        if (!service || service.companyId !== companyId) {
          throw new NotFoundException(this.common.t('media.service_not_found', lang));
        }
      }
      const label = it.label?.trim() || service?.name;
      if (!label) throw new BadRequestException(this.common.t('media.item_label_required', lang));
      const quantity = Number(it.quantity ?? 1);
      const unitPrice = Number(it.unitPrice ?? service?.unitPrice ?? 0);
      out.push({
        serviceId: service?.id ?? null,
        label,
        quantity,
        unit: it.unit ?? service?.unit ?? MediaUnit.SESSION,
        unitPrice,
        total: round2(quantity * unitPrice),
        position: position++,
      });
    }
    return out;
  }

  /** Recalcule sous-total / total / statut de paiement */
  private async recompute(m: EntityManager, project: MediaProject) {
    const items = await m.find(MediaProjectItem, { where: { projectId: project.id } });
    const paid = await m
      .createQueryBuilder(MediaPayment, 'p')
      .select('COALESCE(SUM(p.amount), 0)', 'sum')
      .where('p.projectId = :id', { id: project.id })
      .getRawOne();
    project.subtotal = round2(items.reduce((s, i) => s + Number(i.total || 0), 0));
    const afterDiscount = Math.max(0, project.subtotal - Number(project.discount || 0));
    project.total = round2(afterDiscount * (1 + Number(project.taxRate || 0) / 100));
    project.amountPaid = round2(Number(paid?.sum || 0));
    if (project.kind === MediaProjectKind.INTERNAL && project.total === 0) {
      project.paymentStatus = MediaPaymentStatus.NOT_APPLICABLE;
    } else if (project.amountPaid <= 0) project.paymentStatus = MediaPaymentStatus.UNPAID;
    else if (project.amountPaid + 0.001 < project.total) project.paymentStatus = MediaPaymentStatus.PARTIAL;
    else project.paymentStatus = MediaPaymentStatus.PAID;
    await m.save(MediaProject, project);
    return project;
  }

  private async checkClient(dto: { kind?: MediaProjectKind; clientUserId?: string; clientCompanyId?: string }, lang: string) {
    if (dto.clientUserId) {
      const u = await this.m.findOne(UserEntity, { where: { id: dto.clientUserId } });
      if (!u) throw new NotFoundException(this.common.t('media.client_not_found', lang));
      return u;
    }
    if (dto.clientCompanyId) {
      const c = await this.m.count(CompanyEntity, { where: { id: dto.clientCompanyId } });
      if (!c) throw new NotFoundException(this.common.t('media.client_company_not_found', lang));
    }
    return null;
  }

  // ============================================================
  // CRÉATION / MODIFICATION
  // ============================================================

  async create(dto: CreateMediaProjectDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, dto.companyId, lang);
    const kind = dto.kind ?? (dto.clientCompanyId || dto.requestingDepartment ? MediaProjectKind.INTERNAL : MediaProjectKind.EXTERNAL);
    const clientUser = await this.checkClient({ ...dto, kind }, lang);
    if (kind === MediaProjectKind.EXTERNAL && !dto.clientUserId && !dto.clientName) {
      throw new BadRequestException(this.common.t('media.client_required', lang));
    }
    if (dto.managerId && !(await this.common.isMember(dto.managerId, companyId))) {
      throw new BadRequestException(this.common.t('media.user_not_in_company', lang));
    }

    const project = await this.common.dataSource.transaction(async (m) => {
      const saved = await m.save(
        MediaProject,
        m.create(MediaProject, {
          ...dto,
          companyId,
          kind,
          reference: reference('MED'),
          clientName: dto.clientName ?? clientUser?.fullName ?? null,
          clientPhone: dto.clientPhone ?? clientUser?.phone ?? null,
          clientEmail: dto.clientEmail ?? clientUser?.email ?? null,
          eventDate: dto.eventDate ? new Date(dto.eventDate) : null,
          currency: dto.currency || 'USD',
          discount: dto.discount ?? 0,
          taxRate: dto.taxRate ?? 0,
          status: MediaProjectStatus.REQUEST,
          managerId: dto.managerId ?? user?.id ?? null,
          createdById: user?.id ?? null,
          items: undefined,
        }),
      );
      if (dto.items?.length) {
        const items = await this.buildItems(m, companyId, dto.items, lang);
        await m.save(MediaProjectItem, items.map((i) => m.create(MediaProjectItem, { ...i, projectId: saved.id })));
      }
      await this.recompute(m, saved);
      await this.common.record(saved.id, MediaEventType.CREATED, `Projet créé : ${saved.title}`, user, {
        toStatus: MediaProjectStatus.REQUEST,
        payload: { kind, items: dto.items?.length ?? 0 },
      }, m);
      return saved;
    });

    return { message: this.common.t('media.project_created', lang, { reference: project.reference }), data: await this.detailData(project.id) };
  }

  async update(id: string, dto: UpdateMediaProjectDto, user: UserEntity, lang: string) {
    const project = await this.common.getProject(id, user, lang);
    if ([MediaProjectStatus.COMPLETED, MediaProjectStatus.CANCELLED].includes(project.status)) {
      throw new BadRequestException(this.common.t('media.project_closed', lang));
    }
    await this.checkClient(dto, lang);
    if (dto.managerId && !(await this.common.isMember(dto.managerId, project.companyId))) {
      throw new BadRequestException(this.common.t('media.user_not_in_company', lang));
    }
    await this.common.dataSource.transaction(async (m) => {
      Object.assign(project, dto, dto.eventDate ? { eventDate: new Date(dto.eventDate) } : {});
      await m.save(MediaProject, project);
      await this.recompute(m, project);
      await this.common.record(id, MediaEventType.UPDATED, `Modifié : ${Object.keys(dto).join(', ')}`, user, {}, m);
    });
    return { message: this.common.t('media.project_updated', lang), data: await this.detailData(id) };
  }

  /** Remplace les lignes du devis */
  async setItems(id: string, items: MediaItemInputDto[], user: UserEntity, lang: string) {
    const project = await this.common.getProject(id, user, lang);
    if ([MediaProjectStatus.COMPLETED, MediaProjectStatus.CANCELLED, MediaProjectStatus.DELIVERED].includes(project.status)) {
      throw new BadRequestException(this.common.t('media.project_closed', lang));
    }
    await this.common.dataSource.transaction(async (m) => {
      const built = await this.buildItems(m, project.companyId, items, lang);
      await m.delete(MediaProjectItem, { projectId: id });
      if (built.length) await m.save(MediaProjectItem, built.map((i) => m.create(MediaProjectItem, { ...i, projectId: id })));
      await this.recompute(m, project);
      await this.common.record(id, MediaEventType.ITEMS_UPDATED, `Devis mis à jour : ${built.length} ligne(s), total ${project.total} ${project.currency}`, user, {
        payload: { total: project.total },
      }, m);
    });
    return { message: this.common.t('media.items_updated', lang), data: await this.detailData(id) };
  }

  // ============================================================
  // CYCLE DU PROJET
  // ============================================================

  async changeStatus(id: string, dto: ChangeProjectStatusDto, user: UserEntity, lang: string) {
    const project = await this.common.getProject(id, user, lang);
    const from = project.status;
    if (from === dto.status) return { message: this.common.t('media.status_changed', lang, { status: dto.status }), data: await this.detailData(id) };
    if (!MEDIA_PROJECT_TRANSITIONS[from].includes(dto.status)) {
      throw new BadRequestException(this.common.t('media.invalid_transition', lang, { from, to: dto.status }));
    }
    if (dto.status === MediaProjectStatus.QUOTED) {
      const count = await this.m.count(MediaProjectItem, { where: { projectId: id } });
      if (!count) throw new BadRequestException(this.common.t('media.quote_requires_items', lang));
    }
    if (dto.status === MediaProjectStatus.DELIVERED) {
      const files = await this.m.count(MediaFile, { where: { projectId: id, isDeliverable: true } });
      if (!files) throw new BadRequestException(this.common.t('media.delivery_requires_files', lang));
    }
    if (dto.status === MediaProjectStatus.CANCELLED && !dto.note) {
      throw new BadRequestException(this.common.t('media.cancel_reason_required', lang));
    }

    await this.common.dataSource.transaction(async (m) => {
      const now = new Date();
      project.status = dto.status;
      if (dto.status === MediaProjectStatus.QUOTED) project.quotedAt = now;
      if (dto.status === MediaProjectStatus.CONFIRMED) project.confirmedAt = now;
      if (dto.status === MediaProjectStatus.DELIVERED) project.deliveredAt = now;
      if (dto.status === MediaProjectStatus.COMPLETED) project.completedAt = now;
      if (dto.status === MediaProjectStatus.CANCELLED) {
        project.cancelledAt = now;
        project.cancelReason = dto.note ?? null;
        // Les séances à venir sont annulées (l'équipe et le matériel sont libérés)
        await m.update(
          MediaSession,
          { projectId: id, status: In([MediaSessionStatus.PLANNED, MediaSessionStatus.IN_PROGRESS]) },
          { status: MediaSessionStatus.CANCELLED },
        );
      }
      await m.save(MediaProject, project);
      await this.common.record(id, MediaEventType.STATUS_CHANGED, dto.note || `${from} → ${dto.status}`, user, {
        fromStatus: from,
        toStatus: dto.status,
      }, m);
    });

    // Prévenir le chef de projet et l'équipe des séances
    if ([MediaProjectStatus.CONFIRMED, MediaProjectStatus.CANCELLED, MediaProjectStatus.DELIVERED].includes(dto.status)) {
      const crew = await this.m.query(
        'SELECT DISTINCT c.userId FROM bo_media_session_crew c JOIN bo_media_sessions s ON s.id = c.sessionId WHERE s.projectId = ?',
        [id],
      );
      const ids = [project.managerId, ...crew.map((r: any) => r.userId)].filter((x) => x && x !== user?.id) as string[];
      await this.common.notifyUsers(ids, 'project_status', { reference: project.reference, title: project.title, status: dto.status }, {
        projectId: id,
        status: dto.status,
      }, NotificationType.MEDIA_PROJECT_UPDATE, lang);
    }
    return { message: this.common.t('media.status_changed', lang, { status: dto.status }), data: await this.detailData(id) };
  }

  async addNote(id: string, dto: ProjectNoteDto, user: UserEntity, lang: string) {
    await this.common.getProject(id, user, lang);
    await this.common.record(id, MediaEventType.NOTE, dto.note, user);
    return { message: this.common.t('media.note_added', lang), data: { id } };
  }

  // ============================================================
  // PAIEMENTS
  // ============================================================

  async addPayment(id: string, dto: AddMediaPaymentDto, user: UserEntity, lang: string) {
    const project = await this.common.getProject(id, user, lang);
    if (project.status === MediaProjectStatus.CANCELLED) throw new BadRequestException(this.common.t('media.project_closed', lang));
    const remaining = round2(Number(project.total) - Number(project.amountPaid));
    if (project.total > 0 && dto.amount - remaining > 0.001) {
      throw new BadRequestException(this.common.t('media.payment_exceeds', lang, { remaining, currency: project.currency }));
    }
    const payment = await this.common.dataSource.transaction(async (m) => {
      const p = await m.save(
        MediaPayment,
        m.create(MediaPayment, {
          ...dto,
          companyId: project.companyId,
          projectId: id,
          currency: project.currency,
          method: dto.method ?? MediaPaymentMethod.CASH,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          receivedById: user?.id ?? null,
        }),
      );
      await this.recompute(m, project);
      await this.common.record(id, MediaEventType.PAYMENT, `Paiement ${dto.amount} ${project.currency} (${p.method})`, user, {
        payload: { amount: dto.amount, method: p.method, amountPaid: project.amountPaid, total: project.total },
      }, m);
      return p;
    });
    return {
      message: this.common.t('media.payment_added', lang, { amount: dto.amount, currency: project.currency, remaining: round2(project.total - project.amountPaid) }),
      data: { payment, project: await this.detailData(id) },
    };
  }

  async deletePayment(id: string, paymentId: string, user: UserEntity, lang: string) {
    const project = await this.common.getProject(id, user, lang);
    const payment = await this.m.findOne(MediaPayment, { where: { id: paymentId, projectId: id } });
    if (!payment) throw new NotFoundException(this.common.t('media.payment_not_found', lang));
    await this.common.dataSource.transaction(async (m) => {
      await m.delete(MediaPayment, { id: paymentId });
      await this.recompute(m, project);
      await this.common.record(id, MediaEventType.PAYMENT, `Paiement annulé : ${payment.amount} ${payment.currency}`, user, {
        payload: { cancelledPaymentId: paymentId },
      }, m);
    });
    return { message: this.common.t('media.payment_deleted', lang), data: await this.detailData(id) };
  }

  // ============================================================
  // LIEN DE LIVRAISON (galerie privée pour le client)
  // ============================================================

  async share(id: string, dto: ShareProjectDto, user: UserEntity, lang: string) {
    const project = await this.common.getProject(id, user, lang);
    const files = await this.m.count(MediaFile, { where: { projectId: id, isDeliverable: true } });
    if (!files) throw new BadRequestException(this.common.t('media.delivery_requires_files', lang));
    project.deliveryToken = randomBytes(24).toString('hex');
    project.deliveryTokenExpiresAt = new Date(Date.now() + (dto.days ?? 30) * 86400000);
    await this.m.save(MediaProject, project);
    await this.common.record(id, MediaEventType.SHARED, `Lien de livraison créé (${dto.days ?? 30} jours)`, user);
    const base = process.env.MEDIA_DELIVERY_BASE_URL || `${process.env.BASE_URL || 'https://api-prod.favorhelp.com'}/api/v1/media/public/delivery`;
    return {
      message: this.common.t('media.shared', lang),
      data: { token: project.deliveryToken, url: `${base}/${project.deliveryToken}`, expiresAt: project.deliveryTokenExpiresAt },
    };
  }

  async revokeShare(id: string, user: UserEntity, lang: string) {
    const project = await this.common.getProject(id, user, lang);
    project.deliveryToken = null;
    project.deliveryTokenExpiresAt = null;
    await this.m.save(MediaProject, project);
    await this.common.record(id, MediaEventType.SHARED, 'Lien de livraison désactivé', user);
    return { message: this.common.t('media.share_revoked', lang), data: { id } };
  }

  // ============================================================
  // CONSULTATION
  // ============================================================

  private async detailData(id: string) {
    const project = await this.m.findOne(MediaProject, {
      where: { id },
      relations: ['items', 'items.service', 'manager', 'clientUser'],
    });
    if (!project) return null;
    const p: any = { ...project, items: (project.items ?? []).sort((a, b) => a.position - b.position) };
    p.balance = round2(Number(project.total) - Number(project.amountPaid));
    if (p.manager) p.manager = { id: p.manager.id, fullName: p.manager.fullName, phone: p.manager.phone };
    if (p.clientUser) p.clientUser = { id: p.clientUser.id, fullName: p.clientUser.fullName, phone: p.clientUser.phone, email: p.clientUser.email };
    return p;
  }

  async findOne(id: string, user: UserEntity, lang: string) {
    await this.common.getProject(id, user, lang);
    const [project, sessions, payments, files, events] = await Promise.all([
      this.detailData(id),
      this.m.find(MediaSession, {
        where: { projectId: id },
        relations: ['crew', 'crew.user', 'equipment', 'equipment.asset'],
        order: { startAt: 'ASC' },
      }),
      this.m.find(MediaPayment, { where: { projectId: id }, order: { paidAt: 'DESC' } }),
      this.m.find(MediaFile, { where: { projectId: id }, order: { createdAt: 'DESC' }, take: 200 }),
      this.m.find(MediaProjectEvent, { where: { projectId: id }, relations: ['actor'], order: { createdAt: 'DESC' }, take: 200 }),
    ]);
    return {
      message: this.common.t('media.project_detail', lang),
      data: {
        ...project,
        sessions: sessions.map((s) => ({
          ...s,
          crew: (s.crew ?? []).map((c) => ({ ...c, user: c.user ? { id: c.user.id, fullName: c.user.fullName, phone: c.user.phone } : null })),
          equipment: (s.equipment ?? []).map((e) => ({
            ...e,
            asset: e.asset ? { id: e.asset.id, reference: e.asset.reference, name: e.asset.name, status: e.asset.status } : null,
          })),
        })),
        payments,
        files,
        history: events.map((e) => ({ ...e, actor: e.actor ? { id: e.actor.id, fullName: e.actor.fullName } : null })),
      },
    };
  }

  async list(query: MediaProjectQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, query.companyId, lang);
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const qb = this.m
      .createQueryBuilder(MediaProject, 'p')
      .leftJoin('p.manager', 'manager')
      .addSelect(['manager.id', 'manager.fullName'])
      .where('p.companyId = :companyId', { companyId });
    if (query.kind) qb.andWhere('p.kind = :kind', { kind: query.kind });
    if (query.status) qb.andWhere('p.status = :status', { status: query.status });
    if (query.paymentStatus) qb.andWhere('p.paymentStatus = :ps', { ps: query.paymentStatus });
    if (query.managerId) qb.andWhere('p.managerId = :managerId', { managerId: query.managerId });
    if (query.from) qb.andWhere('COALESCE(p.eventDate, p.createdAt) >= :from', { from: new Date(`${query.from}T00:00:00`) });
    if (query.to) qb.andWhere('COALESCE(p.eventDate, p.createdAt) <= :to', { to: new Date(`${query.to}T23:59:59.999`) });
    if (query.search?.trim()) {
      const kw = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('LOWER(p.reference) LIKE :kw', { kw })
            .orWhere('LOWER(p.title) LIKE :kw', { kw })
            .orWhere('LOWER(p.clientName) LIKE :kw', { kw })
            .orWhere('LOWER(p.clientPhone) LIKE :kw', { kw })
            .orWhere('LOWER(p.requestingDepartment) LIKE :kw', { kw }),
        ),
      );
    }
    const [items, total] = await qb.orderBy('p.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
    return {
      message: this.common.t('media.projects', lang),
      data: new PaginatedResponseDto(items.map((p) => ({ ...p, balance: round2(p.total - p.amountPaid) })) as any, total, page, limit),
    };
  }

  // ============================================================
  // TABLEAU DE BORD
  // ============================================================

  async dashboard(user: UserEntity, lang: string, companyIdParam?: string) {
    const companyId = await this.common.company(user, companyIdParam, lang);
    const m = this.m;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const in7 = new Date(Date.now() + 7 * 86400000);

    const byStatus = await m
      .createQueryBuilder(MediaProject, 'p')
      .select('p.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('p.companyId = :companyId', { companyId })
      .groupBy('p.status')
      .getRawMany();

    const revenueMonth = await m
      .createQueryBuilder(MediaPayment, 'pay')
      .select('pay.currency', 'currency')
      .addSelect('COALESCE(SUM(pay.amount), 0)', 'amount')
      .where('pay.companyId = :companyId', { companyId })
      .andWhere('pay.paidAt >= :monthStart', { monthStart })
      .groupBy('pay.currency')
      .getRawMany();

    const outstanding = await m
      .createQueryBuilder(MediaProject, 'p')
      .select('p.currency', 'currency')
      .addSelect('COALESCE(SUM(p.total - p.amountPaid), 0)', 'amount')
      .addSelect('COUNT(*)', 'projects')
      .where('p.companyId = :companyId', { companyId })
      .andWhere('p.status != :cancelled', { cancelled: MediaProjectStatus.CANCELLED })
      .andWhere('p.paymentStatus IN (:...ps)', { ps: [MediaPaymentStatus.UNPAID, MediaPaymentStatus.PARTIAL] })
      .andWhere('p.total > 0')
      .groupBy('p.currency')
      .getRawMany();

    const topServices = await m
      .createQueryBuilder(MediaProjectItem, 'i')
      .innerJoin('i.project', 'p')
      .leftJoin('i.service', 's')
      .select('COALESCE(s.name, i.label)', 'service')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(i.total), 0)', 'amount')
      .where('p.companyId = :companyId', { companyId })
      .andWhere('p.status != :cancelled', { cancelled: MediaProjectStatus.CANCELLED })
      .groupBy('COALESCE(s.name, i.label)')
      .orderBy('amount', 'DESC')
      .limit(10)
      .getRawMany();

    const [upcomingSessions, lateProjects] = await Promise.all([
      m.find(MediaSession, {
        where: { companyId, status: MediaSessionStatus.PLANNED, startAt: MoreThanOrEqual(new Date()) },
        relations: ['project', 'crew', 'crew.user'],
        order: { startAt: 'ASC' },
        take: 20,
      }).then((rows) => rows.filter((s) => s.startAt <= in7)),
      m
        .createQueryBuilder(MediaProject, 'p')
        .where('p.companyId = :companyId', { companyId })
        .andWhere('p.dueDate < :today', { today: new Date().toISOString().slice(0, 10) })
        .andWhere('p.status NOT IN (:...done)', {
          done: [MediaProjectStatus.DELIVERED, MediaProjectStatus.COMPLETED, MediaProjectStatus.CANCELLED],
        })
        .orderBy('p.dueDate', 'ASC')
        .take(20)
        .getMany(),
    ]);

    return {
      message: this.common.t('media.dashboard', lang),
      data: {
        projectsByStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
        revenueThisMonth: revenueMonth.map((r) => ({ currency: r.currency, amount: Number(r.amount) })),
        outstanding: outstanding.map((r) => ({ currency: r.currency, amount: round2(Number(r.amount)), projects: Number(r.projects) })),
        topServices: topServices.map((r) => ({ service: r.service, count: Number(r.count), amount: Number(r.amount) })),
        upcomingSessions: upcomingSessions.map((s) => ({
          id: s.id,
          title: s.title,
          type: s.type,
          startAt: s.startAt,
          endAt: s.endAt,
          location: s.location,
          project: s.project ? { id: s.project.id, reference: s.project.reference, title: s.project.title } : null,
          crew: (s.crew ?? []).map((c) => ({ userId: c.userId, role: c.role, fullName: c.user?.fullName })),
        })),
        lateProjects,
      },
    };
  }

  /** Projets actifs d'un membre (« mes projets ») */
  async myProjects(user: UserEntity, lang: string, companyIdParam?: string) {
    const companyId = await this.common.company(user, companyIdParam, lang);
    const rows = await this.m
      .createQueryBuilder(MediaProject, 'p')
      .where('p.companyId = :companyId', { companyId })
      .andWhere('p.status NOT IN (:...closed)', { closed: [MediaProjectStatus.COMPLETED, MediaProjectStatus.CANCELLED] })
      .andWhere(
        new Brackets((w) =>
          w
            .where('p.managerId = :uid', { uid: user.id })
            .orWhere(
              'EXISTS (SELECT 1 FROM bo_media_sessions s JOIN bo_media_session_crew c ON c.sessionId = s.id WHERE s.projectId = p.id AND c.userId = :uid)',
              { uid: user.id },
            ),
        ),
      )
      .orderBy('p.eventDate', 'ASC')
      .getMany();
    return { message: this.common.t('media.projects', lang), data: rows };
  }

  /** Pour le contrôleur public : projet via son lien de livraison */
  async findByDeliveryToken(token: string): Promise<MediaProject | null> {
    const p = await this.m.findOne(MediaProject, { where: { deliveryToken: token, status: Not(MediaProjectStatus.CANCELLED) } });
    if (!p) return null;
    if (p.deliveryTokenExpiresAt && p.deliveryTokenExpiresAt.getTime() < Date.now()) return null;
    return p;
  }
}
