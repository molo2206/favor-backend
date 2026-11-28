import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { ServiceClientContact } from './entities/service-client-contact.entity';
import { ServiceClientObjective } from './entities/service-client-objective.entity';
import { ContactRefType } from './enums/contact-ref-type.enum';
import { ObjectivePeriodicity } from './enums/objective-periodicity.enum';
import { ContactStatusDto, MarkContactedDto, UpsertObjectiveDto } from './dto/contacts.dto';

@Injectable()
export class ServiceClientContactsService {
  constructor(
    @InjectRepository(ServiceClientContact)
    private readonly contactRepo: Repository<ServiceClientContact>,
    @InjectRepository(ServiceClientObjective)
    private readonly objectiveRepo: Repository<ServiceClientObjective>,
    @InjectRepository(LtaEntity)
    private readonly ltaRepo: Repository<LtaEntity>,
  ) {}

  // ============================================================
  // PÉRIODE (clé dynamique selon la périodicité de l'objectif)
  // ============================================================
  private periodKey(periodicity: ObjectivePeriodicity, d = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    if (periodicity === ObjectivePeriodicity.DAILY) return `${y}-${m}-${String(d.getDate()).padStart(2, '0')}`;
    if (periodicity === ObjectivePeriodicity.MONTHLY) return `${y}-${m}`;
    if (periodicity === ObjectivePeriodicity.WEEKLY) {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = (date.getUTCDay() + 6) % 7; // lundi = 0
      date.setUTCDate(date.getUTCDate() - dayNum + 3); // jeudi de la semaine ISO
      const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
      const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
      return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }
    return 'ALL'; // ONCE
  }

  // ============================================================
  // OBJECTIFS (critères + périodicité + cible)
  // ============================================================
  async createObjective(dto: UpsertObjectiveDto, agentId: string) {
    const obj = this.objectiveRepo.create({
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      filters: dto.filters ?? null,
      periodicity: dto.periodicity ?? ObjectivePeriodicity.WEEKLY,
      targetCount: dto.targetCount ?? 0,
      isActive: dto.isActive ?? true,
      createdById: agentId,
    });
    return this.objectiveRepo.save(obj);
  }

  async updateObjective(id: string, dto: UpsertObjectiveDto) {
    const obj = await this.objectiveRepo.findOne({ where: { id } });
    if (!obj) throw new NotFoundException('Objectif introuvable.');
    if (dto.name !== undefined) obj.name = dto.name.trim();
    if (dto.description !== undefined) obj.description = dto.description?.trim() || null;
    if (dto.filters !== undefined) obj.filters = dto.filters;
    if (dto.periodicity !== undefined) obj.periodicity = dto.periodicity;
    if (dto.targetCount !== undefined) obj.targetCount = dto.targetCount;
    if (dto.isActive !== undefined) obj.isActive = dto.isActive;
    return this.objectiveRepo.save(obj);
  }

  async listObjectives(onlyActive = false) {
    const where = onlyActive ? { isActive: true } : {};
    return this.objectiveRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getObjective(id: string) {
    const obj = await this.objectiveRepo.findOne({ where: { id } });
    if (!obj) throw new NotFoundException('Objectif introuvable.');
    return obj;
  }

  async deleteObjective(id: string) {
    await this.objectiveRepo.delete({ id });
    return { message: 'Objectif supprimé.' };
  }

  /**
   * Avancement d'un objectif pour la PÉRIODE EN COURS : nb de clients contactés vs cible.
   * La liste des clients elle-même vient de by-destination (filtres de l'objectif) côté appelant.
   */
  async objectiveProgress(id: string) {
    const obj = await this.getObjective(id);
    const periodKey = this.periodKey(obj.periodicity);
    const contacted = await this.contactRepo
      .createQueryBuilder('c')
      .where('c.objectiveId = :id AND c.periodKey = :pk AND c.contacted = 1', { id, pk: periodKey })
      .getCount();
    return {
      objective: obj,
      periodKey,
      filters: obj.filters ?? {},
      target: obj.targetCount || 0,
      contacted,
      remaining: obj.targetCount ? Math.max(0, obj.targetCount - contacted) : null,
      progressPercent: obj.targetCount ? Math.min(100, Math.round((contacted / obj.targetCount) * 100)) : null,
    };
  }

  // ============================================================
  // DISPONIBILISATION D'UNE LTA AU SERVICE CLIENT
  // ============================================================
  async releaseLta(ltaId: string, agentId: string, release = true) {
    const lta = await this.ltaRepo.findOne({ where: { id: ltaId } });
    if (!lta) throw new NotFoundException('LTA introuvable.');
    lta.availableToServiceClient = release;
    lta.releasedToServiceClientById = release ? agentId : null;
    lta.releasedToServiceClientAt = release ? new Date() : null;
    await this.ltaRepo.save(lta);
    return {
      message: release ? 'LTA disponibilisée au service client.' : 'LTA retirée du service client.',
      data: { id: lta.id, ltaNumber: lta.ltaNumber, availableToServiceClient: lta.availableToServiceClient },
    };
  }

  async availableLtas(query: { destination?: string; country?: string; search?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 20));
    const qb = this.ltaRepo.createQueryBuilder('lta').where('lta.availableToServiceClient = 1');
    if (query.destination) qb.andWhere('lta.destination LIKE :d', { d: `%${query.destination}%` });
    if (query.country) qb.andWhere('lta.destination LIKE :c', { c: `%${query.country}%` });
    if (query.search) qb.andWhere('lta.ltaNumber LIKE :s', { s: `%${query.search}%` });
    qb.orderBy('lta.releasedToServiceClientAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  // ============================================================
  // SUIVI DES CONTACTS
  // ============================================================
  private norm(refType?: ContactRefType, refId?: string) {
    return { refType: refType ?? ContactRefType.GENERAL, refId: (refId ?? '').trim() };
  }

  /** Clé de période courante d'un objectif (ou '' si pas d'objectif) */
  private async resolvePeriod(objectiveId?: string): Promise<{ objectiveId: string; periodKey: string }> {
    const oid = (objectiveId ?? '').trim();
    if (!oid) return { objectiveId: '', periodKey: '' };
    const obj = await this.objectiveRepo.findOne({ where: { id: oid } });
    if (!obj) return { objectiveId: oid, periodKey: '' };
    return { objectiveId: oid, periodKey: this.periodKey(obj.periodicity) };
  }

  /** Cocher / décocher un client « contacté » + note. Scope : (client, type, réf, objectif, période). */
  async markContacted(dto: MarkContactedDto, agentId: string) {
    const { refType, refId } = this.norm(dto.refType, dto.refId);
    const { objectiveId, periodKey } = await this.resolvePeriod(dto.objectiveId);
    let row = await this.contactRepo.findOne({ where: { clientUserId: dto.clientUserId, refType, refId, objectiveId, periodKey } });
    if (!row) row = this.contactRepo.create({ clientUserId: dto.clientUserId, refType, refId, objectiveId, periodKey });
    row.contacted = dto.contacted ?? true;
    if (dto.note !== undefined) row.note = dto.note?.trim() || null;
    row.contactedById = agentId;
    row.contactedAt = new Date();
    const saved = await this.contactRepo.save(row);
    return { message: saved.contacted ? 'Client marqué comme contacté.' : 'Contact décoché.', data: saved };
  }

  /**
   * État « contacté » pour une liste de clients, à fusionner avec by-destination.
   * - avec objectiveId → état pour la PÉRIODE EN COURS de cet objectif (dynamique/périodique) ;
   * - sinon → dernier contact connu (éventuellement filtré par refType/refId).
   */
  async statusForClients(dto: ContactStatusDto): Promise<Record<string, { contacted: boolean; note: string | null; contactedAt: Date | null; contactedById: string | null }>> {
    const ids = [...new Set(dto.clientUserIds)].filter(Boolean);
    const out: Record<string, any> = {};
    if (!ids.length) return out;

    const qb = this.contactRepo.createQueryBuilder('c').where('c.clientUserId IN (:...ids)', { ids });
    if (dto.objectiveId) {
      const { objectiveId, periodKey } = await this.resolvePeriod(dto.objectiveId);
      qb.andWhere('c.objectiveId = :oid AND c.periodKey = :pk', { oid: objectiveId, pk: periodKey });
    } else if (dto.refType) {
      qb.andWhere('c.refType = :rt AND c.refId = :ri', { rt: dto.refType, ri: (dto.refId ?? '').trim() });
    }
    qb.orderBy('c.contactedAt', 'DESC');
    const rows = await qb.getMany();

    for (const r of rows) {
      if (out[r.clientUserId]) continue; // garde le plus récent
      out[r.clientUserId] = {
        contacted: !!r.contacted,
        note: r.note ?? null,
        contactedAt: r.contactedAt ?? null,
        contactedById: r.contactedById ?? null,
      };
    }
    for (const id of ids) if (!out[id]) out[id] = { contacted: false, note: null, contactedAt: null, contactedById: null };
    return out;
  }

  /** Historique des contacts d'un client */
  async listForClient(clientUserId: string) {
    return this.contactRepo.find({ where: { clientUserId }, order: { contactedAt: 'DESC' } });
  }
}
