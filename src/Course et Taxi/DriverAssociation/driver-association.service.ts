import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, In, Repository } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { Ride } from '../Ride/entity/Ride.entity';
import { RideStatus } from '../Ride/enum/RideStatus.enum';
import { DriverVehicle } from '../DriverVehicle/entity/DriverVehicle.entity';
import { DriverAssociation } from './entity/driver-association.entity';
import { DriverProfile, DriverType } from './entity/driver-profile.entity';
import {
  AssociationDriversQueryDto,
  AssociationStatsQueryDto,
  CreateDriverAssociationDto,
  DriverAssociationQueryDto,
  SetDriverTypeDto,
  UpdateDriverAssociationDto,
} from './dto/driver-association.dto';

/** Part d'association appliquée à une course */
export interface AssociationShare {
  associationId: string;
  associationName: string;
  rate: number;
}

/**
 * ✅ Chauffeurs privés / membres d'une association.
 * - l'admin crée les associations et rattache les chauffeurs ;
 * - sur chaque course d'un membre, la part de l'association (commissionRate % du prix) est calculée à titre
 *   indicatif (montant dû) : elle n'est ni prélevée ni déduite du gain du chauffeur — paiement manuel.
 */
@Injectable()
export class DriverAssociationService {
  constructor(
    @InjectRepository(DriverAssociation) private readonly assocRepo: Repository<DriverAssociation>,
    @InjectRepository(DriverProfile) private readonly profileRepo: Repository<DriverProfile>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(Ride) private readonly rideRepo: Repository<Ride>,
    @InjectRepository(DriverVehicle) private readonly vehicleRepo: Repository<DriverVehicle>,
  ) { }

  // ============================================================
  // OUTIL PARTAGÉ (utilisé par les courses)
  // ============================================================
  /** Part de l'association pour un chauffeur (null = privé ou association inactive) */
  static async shareFor(manager: EntityManager, driverId?: string | null): Promise<AssociationShare | null> {
    if (!driverId) return null;
    const profile = await manager.findOne(DriverProfile, { where: { driverId }, relations: ['association'] });
    if (!profile || profile.type !== DriverType.ASSOCIATION || !profile.association || !profile.association.isActive) return null;
    return {
      associationId: profile.association.id,
      associationName: profile.association.name,
      rate: Number(profile.association.commissionRate || 0),
    };
  }

  private view(a: DriverAssociation, membersCount?: number) {
    return {
      id: a.id,
      name: a.name,
      code: a.code ?? null,
      city: a.city ? { id: a.city.id, name: (a.city as any).name } : a.cityId ? { id: a.cityId } : null,
      managerName: a.managerName ?? null,
      phone: a.phone ?? null,
      email: a.email ?? null,
      address: a.address ?? null,
      logoUrl: a.logoUrl ?? null,
      description: a.description ?? null,
      commissionRate: Number(a.commissionRate || 0),
      isActive: a.isActive,
      membersCount: membersCount ?? undefined,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  private async findOrFail(id: string) {
    const a = await this.assocRepo.findOne({ where: { id }, relations: ['city'] });
    if (!a) throw new NotFoundException('Association introuvable');
    return a;
  }

  private async membersCount(ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows = await this.profileRepo
      .createQueryBuilder('p')
      .select('p.associationId', 'id')
      .addSelect('COUNT(*)', 'n')
      .where('p.associationId IN (:...ids) AND p.type = :t', { ids, t: DriverType.ASSOCIATION })
      .groupBy('p.associationId')
      .getRawMany();
    return new Map(rows.map((r) => [r.id, Number(r.n || 0)]));
  }

  // ============================================================
  // ASSOCIATIONS (admin)
  // ============================================================
  async list(query: DriverAssociationQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const qb = this.assocRepo.createQueryBuilder('a').leftJoinAndSelect('a.city', 'city');
    const active = query.active ?? 'all';
    if (active !== 'all') qb.andWhere('a.isActive = :active', { active: active === 'true' });
    if (query.cityId) qb.andWhere('a.cityId = :cityId', { cityId: query.cityId });
    if (query.search?.trim()) {
      const q = `%${query.search.trim()}%`;
      qb.andWhere(new Brackets((w) => w.where('a.name LIKE :q', { q }).orWhere('a.code LIKE :q', { q }).orWhere('a.managerName LIKE :q', { q })));
    }
    qb.orderBy('a.name', 'ASC').offset((page - 1) * limit).limit(limit);
    const [rows, total] = await qb.getManyAndCount();
    const counts = await this.membersCount(rows.map((r) => r.id));
    return {
      message: 'Associations de chauffeurs',
      data: rows.map((a) => this.view(a, counts.get(a.id) ?? 0)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const a = await this.findOrFail(id);
    const counts = await this.membersCount([a.id]);
    return { message: 'Association', data: this.view(a, counts.get(a.id) ?? 0) };
  }

  private async assertUnique(dto: { name?: string; code?: string }, exceptId?: string) {
    if (dto.name) {
      const other = await this.assocRepo.findOne({ where: { name: dto.name.trim() } });
      if (other && other.id !== exceptId) throw new ConflictException('Une association porte déjà ce nom');
    }
    if (dto.code) {
      const other = await this.assocRepo.findOne({ where: { code: dto.code.trim() } });
      if (other && other.id !== exceptId) throw new ConflictException('Ce code est déjà utilisé');
    }
  }

  async create(dto: CreateDriverAssociationDto) {
    await this.assertUnique(dto);
    const saved = await this.assocRepo.save(
      this.assocRepo.create({
        ...dto,
        name: dto.name.trim(),
        code: dto.code?.trim() || null,
        commissionRate: dto.commissionRate ?? 0,
        isActive: dto.isActive ?? true,
      }),
    );
    return { message: 'Association créée', data: this.view(await this.findOrFail(saved.id), 0) };
  }

  async update(id: string, dto: UpdateDriverAssociationDto) {
    const a = await this.findOrFail(id);
    await this.assertUnique(dto, a.id);
    Object.assign(a, {
      ...dto,
      ...(dto.name ? { name: dto.name.trim() } : {}),
      ...(dto.code !== undefined ? { code: dto.code?.trim() || null } : {}),
    });
    delete (a as any).city;
    await this.assocRepo.save(a);
    return this.findOne(id);
  }

  /** Supprimer : les membres repassent PRIVÉS (les courses passées gardent leur historique) */
  async remove(id: string) {
    const a = await this.findOrFail(id);
    await this.profileRepo.update({ associationId: a.id }, { type: DriverType.PRIVATE, associationId: null, memberNumber: null });
    await this.assocRepo.delete({ id: a.id });
    return { message: 'Association supprimée — ses membres sont maintenant privés', data: { id: a.id } };
  }

  // ============================================================
  // CHAUFFEURS : PRIVÉ / MEMBRE
  // ============================================================
  private profileView(driver: UserEntity | null, profile: DriverProfile | null, driverId: string) {
    const isMember = profile?.type === DriverType.ASSOCIATION && !!profile.association;
    return {
      driver: driver
        ? { id: driver.id, fullName: (driver as any).fullName, phone: (driver as any).phone, email: (driver as any).email, image: (driver as any).image ?? null }
        : { id: driverId },
      type: isMember ? DriverType.ASSOCIATION : DriverType.PRIVATE,
      association: isMember
        ? {
          id: profile!.association!.id,
          name: profile!.association!.name,
          code: profile!.association!.code ?? null,
          commissionRate: Number(profile!.association!.commissionRate || 0),
          isActive: profile!.association!.isActive,
        }
        : null,
      memberNumber: isMember ? profile?.memberNumber ?? null : null,
      joinedAt: isMember ? profile?.joinedAt ?? null : null,
      note: profile?.note ?? null,
      updatedAt: profile?.updatedAt ?? null,
    };
  }

  async getDriverProfile(driverId: string) {
    const driver = await this.userRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Chauffeur non trouvé');
    const profile = await this.profileRepo.findOne({ where: { driverId }, relations: ['association'] });
    return { message: 'Statut du chauffeur', data: this.profileView(driver, profile, driverId) };
  }

  /** Admin : rendre un chauffeur PRIVÉ ou le rattacher à une association */
  async setDriverType(driverId: string, dto: SetDriverTypeDto, admin: UserEntity) {
    const driver = await this.userRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Chauffeur non trouvé');

    let association: DriverAssociation | null = null;
    if (dto.type === DriverType.ASSOCIATION) {
      association = await this.assocRepo.findOne({ where: { id: dto.associationId! } });
      if (!association) throw new NotFoundException('Association introuvable');
      if (!association.isActive) throw new BadRequestException('Cette association est désactivée');
    }

    let profile = await this.profileRepo.findOne({ where: { driverId } });
    const changedAssociation = !profile || profile.associationId !== (association?.id ?? null);
    if (!profile) profile = this.profileRepo.create({ driverId });
    profile.type = dto.type;
    profile.associationId = association?.id ?? null;
    profile.memberNumber = association ? dto.memberNumber ?? (changedAssociation ? null : profile.memberNumber) : null;
    profile.joinedAt = association ? (changedAssociation ? new Date() : profile.joinedAt ?? new Date()) : null;
    if (dto.note !== undefined) profile.note = dto.note;
    profile.updatedById = admin?.id ?? null;
    await this.profileRepo.save(profile);
    return this.getDriverProfile(driverId);
  }

  /** Chauffeur connecté : son statut */
  me(user: UserEntity) {
    return this.getDriverProfile(user.id);
  }

  /** Membres d'une association (avec leur véhicule actif) */
  async members(associationId: string, query: AssociationDriversQueryDto) {
    await this.findOrFail(associationId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const qb = this.profileRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.driver', 'driver')
      .leftJoinAndSelect('p.association', 'association')
      .where('p.associationId = :id AND p.type = :t', { id: associationId, t: DriverType.ASSOCIATION });
    if (query.search?.trim()) {
      const q = `%${query.search.trim()}%`;
      qb.andWhere(new Brackets((w) => w.where('driver.fullName LIKE :q', { q }).orWhere('driver.phone LIKE :q', { q }).orWhere('p.memberNumber LIKE :q', { q })));
    }
    qb.orderBy('p.joinedAt', 'DESC').offset((page - 1) * limit).limit(limit);
    const [rows, total] = await qb.getManyAndCount();

    const vehicles = rows.length
      ? await this.vehicleRepo.find({ where: { driverId: In(rows.map((r) => r.driverId)), isActive: true } })
      : [];
    return {
      message: 'Membres de l\'association',
      data: rows.map((p) => ({
        ...this.profileView(p.driver, p, p.driverId),
        vehicles: vehicles
          .filter((v) => v.driverId === p.driverId)
          .map((v) => ({ id: v.id, model: v.model, plateNumber: v.plateNumber, kycStatus: v.kycStatus, isDefault: v.isDefault })),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Statuts de plusieurs chauffeurs (pour les listes admin) */
  async profilesFor(driverIds: string[]): Promise<Map<string, ReturnType<DriverAssociationService['profileView']>>> {
    const ids = [...new Set(driverIds.filter(Boolean))];
    const out = new Map<string, any>();
    if (!ids.length) return out;
    const profiles = await this.profileRepo.find({ where: { driverId: In(ids) }, relations: ['association'] });
    for (const id of ids) out.set(id, this.profileView(null, profiles.find((p) => p.driverId === id) ?? null, id));
    return out;
  }

  // ============================================================
  // STATISTIQUES (courses terminées)
  // ============================================================
  private period(query: AssociationStatsQueryDto) {
    const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : new Date();
    const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : new Date(to.getTime() - 30 * 86400000);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new BadRequestException('Dates invalides (YYYY-MM-DD)');
    return { from, to };
  }

  private sums(qb: any) {
    return qb
      .addSelect('COUNT(*)', 'rides')
      .addSelect('COALESCE(SUM(r.finalPrice), 0)', 'revenue')
      .addSelect('COALESCE(SUM(r.commissionAmount), 0)', 'platformCommission')
      .addSelect('COALESCE(SUM(r.associationCommissionAmount), 0)', 'associationCommission')
      .addSelect('COALESCE(SUM(r.driverEarning), 0)', 'driverEarnings');
  }

  private num(row: any) {
    return {
      rides: Number(row?.rides || 0),
      revenue: Math.round(Number(row?.revenue || 0) * 100) / 100,
      platformCommission: Math.round(Number(row?.platformCommission || 0) * 100) / 100,
      associationCommission: Math.round(Number(row?.associationCommission || 0) * 100) / 100,
      driverEarnings: Math.round(Number(row?.driverEarnings || 0) * 100) / 100,
    };
  }

  /** Toutes les associations + chauffeurs privés : courses, chiffre d'affaires, parts */
  async statsAll(query: AssociationStatsQueryDto) {
    const { from, to } = this.period(query);
    const base = () =>
      this.rideRepo
        .createQueryBuilder('r')
        .where('r.status = :s', { s: RideStatus.COMPLETED })
        .andWhere('r.completedAt BETWEEN :from AND :to', { from, to });
    const [byAssoc, privateRow] = await Promise.all([
      this.sums(base().select('r.associationId', 'associationId').addSelect('r.currency', 'currency').andWhere('r.associationId IS NOT NULL'))
        .groupBy('r.associationId')
        .addGroupBy('r.currency')
        .getRawMany(),
      this.sums(base().select('r.currency', 'currency').andWhere('r.associationId IS NULL')).groupBy('r.currency').getRawMany(),
    ]);
    const assocs = byAssoc.length ? await this.assocRepo.find({ where: { id: In(byAssoc.map((r: any) => r.associationId)) } }) : [];
    return {
      message: 'Statistiques des associations',
      data: {
        period: { from, to },
        associations: byAssoc.map((r: any) => ({
          association: { id: r.associationId, name: assocs.find((a) => a.id === r.associationId)?.name ?? null },
          currency: r.currency ?? null,
          ...this.num(r),
        })),
        privateDrivers: privateRow.map((r: any) => ({ currency: r.currency ?? null, ...this.num(r) })),
      },
    };
  }

  /** Une association : totaux + détail par chauffeur membre */
  async stats(associationId: string, query: AssociationStatsQueryDto) {
    const a = await this.findOrFail(associationId);
    const { from, to } = this.period(query);
    const base = () =>
      this.rideRepo
        .createQueryBuilder('r')
        .where('r.status = :s AND r.associationId = :id', { s: RideStatus.COMPLETED, id: a.id })
        .andWhere('r.completedAt BETWEEN :from AND :to', { from, to });
    const [totals, byDriver] = await Promise.all([
      this.sums(base().select('r.currency', 'currency')).groupBy('r.currency').getRawMany(),
      this.sums(base().select('r.driverId', 'driverId').addSelect('r.currency', 'currency'))
        .groupBy('r.driverId')
        .addGroupBy('r.currency')
        .orderBy('rides', 'DESC')
        .getRawMany(),
    ]);
    const drivers = byDriver.length ? await this.userRepo.find({ where: { id: In(byDriver.map((r: any) => r.driverId)) } }) : [];
    return {
      message: 'Statistiques de l\'association',
      data: {
        association: this.view(a),
        period: { from, to },
        totals: totals.map((r: any) => ({ currency: r.currency ?? null, ...this.num(r) })),
        drivers: byDriver.map((r: any) => {
          const d = drivers.find((u) => u.id === r.driverId);
          return {
            driver: d ? { id: d.id, fullName: (d as any).fullName, phone: (d as any).phone } : { id: r.driverId },
            currency: r.currency ?? null,
            ...this.num(r),
          };
        }),
      },
    };
  }
}
