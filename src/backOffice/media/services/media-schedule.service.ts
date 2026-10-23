import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, In, Not } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { Asset } from 'src/backOffice/logistics/assets/entities/asset.entity';
import { AssetStatus } from 'src/backOffice/logistics/common/logistics.enums';
import { MediaCrewRole, MediaEventType, MediaProjectStatus, MediaSessionStatus, MediaSessionType } from '../media.enums';
import { MediaSession } from '../entities/media-session.entity';
import { MediaProject } from '../entities/media-project.entity';
import { MediaSessionCrew } from '../entities/media-session-crew.entity';
import { MediaSessionEquipment } from '../entities/media-session-equipment.entity';
import { MediaTeamMember } from '../entities/media-team-member.entity';
import {
  AssignCrewDto,
  AvailabilityQueryDto,
  BookEquipmentDto,
  CreateMediaSessionDto,
  SessionQueryDto,
  SessionStatusDto,
  UpdateMediaSessionDto,
} from '../dto/media.dto';
import { MediaCommonService } from './media-common.service';

const ACTIVE_SESSION = [MediaSessionStatus.PLANNED, MediaSessionStatus.IN_PROGRESS];
const UNAVAILABLE_ASSET = [AssetStatus.IN_REPAIR, AssetStatus.LOST, AssetStatus.DISPOSED];

/** Planning des tournages / séances : équipe, matériel, conflits d'horaire */
@Injectable()
export class MediaScheduleService {
  constructor(private readonly common: MediaCommonService) { }

  private get m() {
    return this.common.dataSource.manager;
  }

  private fmt(d: Date) {
    return new Date(d).toISOString().slice(0, 16).replace('T', ' ');
  }

  private parsePeriod(startAt: string | Date, endAt: string | Date, lang: string) {
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException(this.common.t('media.invalid_period', lang));
    }
    return { start, end };
  }

  private async getSession(id: string, user: UserEntity, lang: string, m?: EntityManager) {
    const session = await (m ?? this.m).findOne(MediaSession, { where: { id }, relations: ['project'] });
    if (!session) throw new NotFoundException(this.common.t('media.session_not_found', lang));
    await this.common.company(user, session.companyId, lang);
    return session;
  }

  /** Séances actives d'un membre qui chevauchent la période */
  private async crewConflicts(m: EntityManager, userId: string, start: Date, end: Date, excludeSessionId?: string) {
    const qb = m
      .createQueryBuilder(MediaSessionCrew, 'c')
      .innerJoinAndSelect('c.session', 's')
      .where('c.userId = :userId', { userId })
      .andWhere('s.status IN (:...st)', { st: ACTIVE_SESSION })
      .andWhere('s.startAt < :end AND s.endAt > :start', { start, end });
    if (excludeSessionId) qb.andWhere('s.id != :ex', { ex: excludeSessionId });
    return qb.getMany();
  }

  /** Séances actives qui utilisent déjà ce matériel sur la période */
  private async equipmentConflicts(m: EntityManager, assetId: string, start: Date, end: Date, excludeSessionId?: string) {
    const qb = m
      .createQueryBuilder(MediaSessionEquipment, 'e')
      .innerJoinAndSelect('e.session', 's')
      .where('e.assetId = :assetId', { assetId })
      .andWhere('s.status IN (:...st)', { st: ACTIVE_SESSION })
      .andWhere('s.startAt < :end AND s.endAt > :start', { start, end });
    if (excludeSessionId) qb.andWhere('s.id != :ex', { ex: excludeSessionId });
    return qb.getMany();
  }

  private async assertCrewFree(m: EntityManager, session: MediaSession, userId: string, lang: string) {
    const conflicts = await this.crewConflicts(m, userId, session.startAt, session.endAt, session.id);
    if (conflicts.length) {
      const c = conflicts[0].session;
      throw new ConflictException(this.common.t('media.crew_busy', lang, { title: c.title, start: this.fmt(c.startAt), end: this.fmt(c.endAt) }));
    }
  }

  private async assertEquipmentFree(m: EntityManager, session: MediaSession, asset: Asset, lang: string) {
    if (UNAVAILABLE_ASSET.includes(asset.status)) {
      throw new BadRequestException(this.common.t('media.equipment_unavailable', lang, { name: asset.name, status: asset.status }));
    }
    const conflicts = await this.equipmentConflicts(m, asset.id, session.startAt, session.endAt, session.id);
    if (conflicts.length) {
      const c = conflicts[0].session;
      throw new ConflictException(this.common.t('media.equipment_busy', lang, { name: asset.name, title: c.title, start: this.fmt(c.startAt) }));
    }
  }

  private async addCrewInternal(m: EntityManager, session: MediaSession, dto: AssignCrewDto, user: UserEntity, lang: string) {
    if (!(await this.common.isMember(dto.userId, session.companyId))) {
      throw new BadRequestException(this.common.t('media.user_not_in_company', lang));
    }
    const exists = await m.findOne(MediaSessionCrew, { where: { sessionId: session.id, userId: dto.userId } });
    if (exists) return exists;
    await this.assertCrewFree(m, session, dto.userId, lang);
    let role = dto.role;
    if (!role) {
      const member = await m.findOne(MediaTeamMember, { where: { companyId: session.companyId, userId: dto.userId } });
      role = (member?.roles?.[0] as MediaCrewRole) ?? MediaCrewRole.OTHER;
    }
    const crew = await m.save(MediaSessionCrew, m.create(MediaSessionCrew, { sessionId: session.id, userId: dto.userId, role, note: dto.note ?? null }));
    await this.common.record(session.projectId, MediaEventType.CREW_ASSIGNED, `${role} affecté à « ${session.title} »`, user, {
      payload: { sessionId: session.id, userId: dto.userId, role },
    }, m);
    return crew;
  }

  private async addEquipmentInternal(m: EntityManager, session: MediaSession, dto: BookEquipmentDto, user: UserEntity, lang: string) {
    const asset = await m.findOne(Asset, { where: { id: dto.assetId } });
    if (!asset || asset.companyId !== session.companyId) throw new NotFoundException(this.common.t('media.equipment_not_found', lang));
    const exists = await m.findOne(MediaSessionEquipment, { where: { sessionId: session.id, assetId: asset.id } });
    if (exists) return exists;
    await this.assertEquipmentFree(m, session, asset, lang);
    const eq = await m.save(MediaSessionEquipment, m.create(MediaSessionEquipment, { sessionId: session.id, assetId: asset.id, note: dto.note ?? null }));
    await this.common.record(session.projectId, MediaEventType.EQUIPMENT_BOOKED, `Matériel réservé : ${asset.reference} ${asset.name}`, user, {
      payload: { sessionId: session.id, assetId: asset.id },
    }, m);
    return eq;
  }

  private notifyCrew(session: MediaSession, userIds: string[], key: string, actor: UserEntity, lang: string) {
    const ids = userIds.filter((id) => id && id !== actor?.id);
    if (!ids.length) return;
    void this.common.notifyUsers(
      ids,
      key,
      { title: session.title, start: this.fmt(session.startAt), location: session.location || '' },
      { sessionId: session.id, projectId: session.projectId, startAt: session.startAt },
      undefined,
      lang,
    );
  }

  // ============================================================
  // SÉANCES
  // ============================================================

  async create(projectId: string, dto: CreateMediaSessionDto, user: UserEntity, lang: string) {
    const project = await this.common.getProject(projectId, user, lang);
    if ([MediaProjectStatus.COMPLETED, MediaProjectStatus.CANCELLED].includes(project.status)) {
      throw new BadRequestException(this.common.t('media.project_closed', lang));
    }
    const { start, end } = this.parsePeriod(dto.startAt, dto.endAt, lang);

    const session = await this.common.dataSource.transaction(async (m) => {
      const s = await m.save(
        MediaSession,
        m.create(MediaSession, {
          companyId: project.companyId,
          projectId,
          title: dto.title,
          type: dto.type ?? MediaSessionType.PHOTO,
          startAt: start,
          endAt: end,
          location: dto.location ?? project.location ?? null,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          notes: dto.notes ?? null,
          status: MediaSessionStatus.PLANNED,
          createdById: user?.id ?? null,
        }),
      );
      for (const c of dto.crew ?? []) await this.addCrewInternal(m, s, c, user, lang);
      for (const assetId of dto.assetIds ?? []) await this.addEquipmentInternal(m, s, { assetId }, user, lang);
      await this.common.record(projectId, MediaEventType.SESSION_PLANNED, `Séance planifiée : ${s.title} (${this.fmt(start)})`, user, {
        payload: { sessionId: s.id, type: s.type },
      }, m);
      return s;
    });

    this.notifyCrew(session, (dto.crew ?? []).map((c) => c.userId), 'crew_assigned', user, lang);
    return { message: this.common.t('media.session_created', lang), data: await this.detail(session.id) };
  }

  async update(id: string, dto: UpdateMediaSessionDto, user: UserEntity, lang: string) {
    const session = await this.getSession(id, user, lang);
    if (!ACTIVE_SESSION.includes(session.status)) throw new BadRequestException(this.common.t('media.session_closed', lang));
    const timeChanged = !!(dto.startAt || dto.endAt);
    const { start, end } = this.parsePeriod(dto.startAt ?? session.startAt, dto.endAt ?? session.endAt, lang);

    await this.common.dataSource.transaction(async (m) => {
      Object.assign(session, dto, { startAt: start, endAt: end });
      delete (session as any).project;
      if (timeChanged) {
        // Nouvel horaire : l'équipe et le matériel doivent rester disponibles
        const crew = await m.find(MediaSessionCrew, { where: { sessionId: id } });
        for (const c of crew) await this.assertCrewFree(m, session, c.userId, lang);
        const eq = await m.find(MediaSessionEquipment, { where: { sessionId: id }, relations: ['asset'] });
        for (const e of eq) await this.assertEquipmentFree(m, session, e.asset, lang);
      }
      await m.save(MediaSession, session);
      await this.common.record(session.projectId, MediaEventType.SESSION_UPDATED, `Séance modifiée : ${session.title}`, user, {
        payload: { sessionId: id, fields: Object.keys(dto) },
      }, m);
    });

    if (timeChanged) {
      const crew = await this.m.find(MediaSessionCrew, { where: { sessionId: id } });
      this.notifyCrew(session, crew.map((c) => c.userId), 'session_rescheduled', user, lang);
    }
    return { message: this.common.t('media.session_updated', lang), data: await this.detail(id) };
  }

  async changeStatus(id: string, dto: SessionStatusDto, user: UserEntity, lang: string) {
    const session = await this.getSession(id, user, lang);
    if (session.status === dto.status) return { message: this.common.t('media.session_updated', lang), data: await this.detail(id) };
    if ([MediaSessionStatus.DONE, MediaSessionStatus.CANCELLED].includes(session.status)) {
      throw new BadRequestException(this.common.t('media.session_closed', lang));
    }
    const from = session.status;
    session.status = dto.status;
    delete (session as any).project;
    await this.m.save(MediaSession, session);
    await this.common.record(session.projectId, MediaEventType.SESSION_UPDATED, `Séance « ${session.title} » : ${from} → ${dto.status}${dto.note ? ` — ${dto.note}` : ''}`, user, {
      payload: { sessionId: id, from, to: dto.status },
    });

    // Première séance démarrée → projet en production
    if (dto.status === MediaSessionStatus.IN_PROGRESS) {
      await this.m.update(
        MediaProject,
        { id: session.projectId, status: MediaProjectStatus.CONFIRMED },
        { status: MediaProjectStatus.IN_PRODUCTION },
      );
    }
    if (dto.status === MediaSessionStatus.CANCELLED) {
      const crew = await this.m.find(MediaSessionCrew, { where: { sessionId: id } });
      this.notifyCrew(session, crew.map((c) => c.userId), 'session_cancelled', user, lang);
    }
    return { message: this.common.t('media.session_updated', lang), data: await this.detail(id) };
  }

  async remove(id: string, user: UserEntity, lang: string) {
    const session = await this.getSession(id, user, lang);
    if (session.status === MediaSessionStatus.DONE) throw new BadRequestException(this.common.t('media.session_closed', lang));
    const crew = await this.m.find(MediaSessionCrew, { where: { sessionId: id } });
    await this.m.delete(MediaSession, { id });
    await this.common.record(session.projectId, MediaEventType.SESSION_UPDATED, `Séance supprimée : ${session.title}`, user);
    this.notifyCrew(session, crew.map((c) => c.userId), 'session_cancelled', user, lang);
    return { message: this.common.t('media.session_deleted', lang), data: { id } };
  }

  // ---------- Équipe ----------
  async addCrew(id: string, dto: AssignCrewDto, user: UserEntity, lang: string) {
    const session = await this.getSession(id, user, lang);
    if (!ACTIVE_SESSION.includes(session.status)) throw new BadRequestException(this.common.t('media.session_closed', lang));
    await this.common.dataSource.transaction((m) => this.addCrewInternal(m, session, dto, user, lang));
    this.notifyCrew(session, [dto.userId], 'crew_assigned', user, lang);
    return { message: this.common.t('media.crew_assigned', lang), data: await this.detail(id) };
  }

  async removeCrew(id: string, userId: string, user: UserEntity, lang: string) {
    const session = await this.getSession(id, user, lang);
    const res = await this.m.delete(MediaSessionCrew, { sessionId: id, userId });
    if (!res.affected) throw new NotFoundException(this.common.t('media.crew_not_found', lang));
    await this.common.record(session.projectId, MediaEventType.CREW_REMOVED, `Retiré de « ${session.title} »`, user, { payload: { sessionId: id, userId } });
    this.notifyCrew(session, [userId], 'crew_removed', user, lang);
    return { message: this.common.t('media.crew_removed', lang), data: await this.detail(id) };
  }

  // ---------- Matériel (biens de l'entreprise) ----------
  async addEquipment(id: string, dto: BookEquipmentDto, user: UserEntity, lang: string) {
    const session = await this.getSession(id, user, lang);
    if (!ACTIVE_SESSION.includes(session.status)) throw new BadRequestException(this.common.t('media.session_closed', lang));
    await this.common.dataSource.transaction((m) => this.addEquipmentInternal(m, session, dto, user, lang));
    return { message: this.common.t('media.equipment_booked', lang), data: await this.detail(id) };
  }

  async removeEquipment(id: string, assetId: string, user: UserEntity, lang: string) {
    const session = await this.getSession(id, user, lang);
    const res = await this.m.delete(MediaSessionEquipment, { sessionId: id, assetId });
    if (!res.affected) throw new NotFoundException(this.common.t('media.equipment_not_found', lang));
    await this.common.record(session.projectId, MediaEventType.EQUIPMENT_RELEASED, `Matériel libéré (séance « ${session.title} »)`, user, {
      payload: { sessionId: id, assetId },
    });
    return { message: this.common.t('media.equipment_released', lang), data: await this.detail(id) };
  }

  // ============================================================
  // CONSULTATION
  // ============================================================

  async detail(id: string) {
    const s = await this.m.findOne(MediaSession, {
      where: { id },
      relations: ['project', 'crew', 'crew.user', 'equipment', 'equipment.asset'],
    });
    if (!s) return null;
    return {
      ...s,
      project: s.project ? { id: s.project.id, reference: s.project.reference, title: s.project.title, status: s.project.status } : null,
      crew: (s.crew ?? []).map((c) => ({ ...c, user: c.user ? { id: c.user.id, fullName: c.user.fullName, phone: c.user.phone, image: c.user.image } : null })),
      equipment: (s.equipment ?? []).map((e) => ({
        ...e,
        asset: e.asset ? { id: e.asset.id, reference: e.asset.reference, name: e.asset.name, brand: e.asset.brand, model: e.asset.model, status: e.asset.status } : null,
      })),
    };
  }

  async findOne(id: string, user: UserEntity, lang: string) {
    await this.getSession(id, user, lang);
    return { message: this.common.t('media.session_detail', lang), data: await this.detail(id) };
  }

  /** Calendrier : séances sur une période (filtre par projet, membre ou matériel) */
  async calendar(query: SessionQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, query.companyId, lang);
    const from = query.from ? new Date(`${query.from}T00:00:00`) : new Date(new Date().setHours(0, 0, 0, 0));
    const to = query.to ? new Date(`${query.to}T23:59:59.999`) : new Date(from.getTime() + 30 * 86400000);
    const qb = this.m
      .createQueryBuilder(MediaSession, 's')
      .leftJoinAndSelect('s.project', 'project')
      .leftJoinAndSelect('s.crew', 'crew')
      .leftJoin('crew.user', 'crewUser')
      .addSelect(['crewUser.id', 'crewUser.fullName'])
      .leftJoinAndSelect('s.equipment', 'equipment')
      .leftJoin('equipment.asset', 'asset')
      .addSelect(['asset.id', 'asset.reference', 'asset.name'])
      .where('s.companyId = :companyId', { companyId })
      .andWhere('s.startAt < :to AND s.endAt > :from', { from, to });
    if (query.projectId) qb.andWhere('s.projectId = :projectId', { projectId: query.projectId });
    if (query.status) qb.andWhere('s.status = :status', { status: query.status });
    if (query.userId) {
      qb.andWhere('EXISTS (SELECT 1 FROM bo_media_session_crew c2 WHERE c2.sessionId = s.id AND c2.userId = :uid)', { uid: query.userId });
    }
    if (query.assetId) {
      qb.andWhere('EXISTS (SELECT 1 FROM bo_media_session_equipment e2 WHERE e2.sessionId = s.id AND e2.assetId = :aid)', { aid: query.assetId });
    }
    const data = await qb.orderBy('s.startAt', 'ASC').getMany();
    return { message: this.common.t('media.calendar', lang), data };
  }

  /** Mon planning (membre de l'équipe connecté) */
  mySchedule(user: UserEntity, lang: string, companyId?: string, from?: string, to?: string) {
    return this.calendar({ companyId, userId: user.id, from, to }, user, lang);
  }

  /**
   * Disponibilités sur un créneau : membres de l'équipe et matériel média
   * (biens de l'entreprise) libres ou occupés.
   */
  async availability(query: AvailabilityQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.common.company(user, query.companyId, lang);
    const { start, end } = this.parsePeriod(query.startAt, query.endAt, lang);
    const m = this.m;

    const members = await m.find(MediaTeamMember, { where: { companyId, isActive: true }, relations: ['user'] });
    const busyCrew = await m
      .createQueryBuilder(MediaSessionCrew, 'c')
      .innerJoinAndSelect('c.session', 's')
      .where('s.companyId = :companyId', { companyId })
      .andWhere('s.status IN (:...st)', { st: ACTIVE_SESSION })
      .andWhere('s.startAt < :end AND s.endAt > :start', { start, end })
      .andWhere(query.excludeSessionId ? 's.id != :ex' : '1=1', { ex: query.excludeSessionId })
      .getMany();
    const busyByUser = new Map<string, any[]>();
    for (const c of busyCrew) {
      if (!busyByUser.has(c.userId)) busyByUser.set(c.userId, []);
      busyByUser.get(c.userId)!.push({ sessionId: c.sessionId, title: c.session.title, startAt: c.session.startAt, endAt: c.session.endAt });
    }

    // Matériel : celui d'une catégorie de biens (ex. « Caméras ») si demandée,
    // sinon tout le matériel déjà utilisé par l'équipe média
    let assets: Asset[];
    if (query.assetCategoryId) {
      assets = await m.find(Asset, {
        where: { companyId, categoryId: query.assetCategoryId, status: Not(AssetStatus.DISPOSED) },
        order: { name: 'ASC' },
      });
    } else {
      const usedAssetIds = await m.query(
        'SELECT DISTINCT e.assetId FROM bo_media_session_equipment e JOIN bo_media_sessions s ON s.id = e.sessionId WHERE s.companyId = ?',
        [companyId],
      );
      const ids = usedAssetIds.map((r: any) => r.assetId);
      assets = ids.length ? await m.find(Asset, { where: { id: In(ids) } }) : [];
    }
    const busyEquipment = await m
      .createQueryBuilder(MediaSessionEquipment, 'e')
      .innerJoinAndSelect('e.session', 's')
      .where('s.companyId = :companyId', { companyId })
      .andWhere('s.status IN (:...st)', { st: ACTIVE_SESSION })
      .andWhere('s.startAt < :end AND s.endAt > :start', { start, end })
      .andWhere(query.excludeSessionId ? 's.id != :ex' : '1=1', { ex: query.excludeSessionId })
      .getMany();
    const busyByAsset = new Map<string, any[]>();
    for (const e of busyEquipment) {
      if (!busyByAsset.has(e.assetId)) busyByAsset.set(e.assetId, []);
      busyByAsset.get(e.assetId)!.push({ sessionId: e.sessionId, title: e.session.title, startAt: e.session.startAt, endAt: e.session.endAt });
    }

    return {
      message: this.common.t('media.availability', lang),
      data: {
        startAt: start,
        endAt: end,
        team: members.map((mb) => ({
          userId: mb.userId,
          fullName: mb.user?.fullName ?? null,
          roles: mb.roles ?? [],
          available: !busyByUser.has(mb.userId),
          busyWith: busyByUser.get(mb.userId) ?? [],
        })),
        equipment: assets.map((a) => ({
          assetId: a.id,
          reference: a.reference,
          name: a.name,
          status: a.status,
          available: !UNAVAILABLE_ASSET.includes(a.status) && !busyByAsset.has(a.id),
          busyWith: busyByAsset.get(a.id) ?? [],
        })),
      },
    };
  }
}
