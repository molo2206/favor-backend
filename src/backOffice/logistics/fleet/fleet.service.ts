import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, LessThanOrEqual, Not } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import {
  FleetMaintenanceStatus,
  FleetMissionStatus,
  FleetMissionType,
  FleetVehicleStatus,
} from '../common/logistics.enums';
import { pageParams, reference, resolveCompanyId } from '../common/logistics-access';
import { FleetVehicle } from './entities/fleet-vehicle.entity';
import { FleetMission } from './entities/fleet-mission.entity';
import { FleetFuelLog } from './entities/fleet-fuel-log.entity';
import { FleetMaintenance } from './entities/fleet-maintenance.entity';
import { FleetDocument } from './entities/fleet-document.entity';
import {
  AssignDriverDto,
  CancelDto,
  CompleteMaintenanceDto,
  CompleteMissionDto,
  CreateDocumentDto,
  CreateFuelLogDto,
  CreateMaintenanceDto,
  CreateMissionDto,
  CreateVehicleDto,
  DocumentQueryDto,
  FuelQueryDto,
  MaintenanceQueryDto,
  MissionQueryDto,
  StartMissionDto,
  UpdateDocumentDto,
  UpdateVehicleDto,
  VehicleQueryDto,
} from './dto/fleet.dto';

/**
 * Charroi de l'entreprise : véhicules, missions, carburant, entretien, documents.
 */
@Injectable()
export class FleetService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
  ) { }

  private t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params);
  }

  private company(user: UserEntity, companyId: string | undefined | null, lang: string) {
    return resolveCompanyId(this.dataSource, user, companyId, {
      required: this.t('fleet.company_required', lang),
      forbidden: this.t('fleet.forbidden', lang),
    });
  }

  /** Véhicule + contrôle d'accès à son entreprise */
  async getVehicle(id: string, user: UserEntity, lang: string, m?: EntityManager): Promise<FleetVehicle> {
    const vehicle = await (m ?? this.dataSource.manager).findOne(FleetVehicle, { where: { id } });
    if (!vehicle) throw new NotFoundException(this.t('fleet.vehicle_not_found', lang));
    await this.company(user, vehicle.companyId, lang);
    return vehicle;
  }

  private async checkUser(id: string | undefined | null, lang: string): Promise<void> {
    if (!id) return;
    const exists = await this.dataSource.manager.count(UserEntity, { where: { id } });
    if (!exists) throw new NotFoundException(this.t('fleet.driver_not_found', lang));
  }

  private async checkBranch(id: string | undefined | null, companyId: string, lang: string): Promise<void> {
    if (!id) return;
    const branch = await this.dataSource.manager.findOne(BranchEntity, { where: { id } });
    if (!branch || branch.deleted) throw new NotFoundException(this.t('fleet.branch_not_found', lang));
    if (branch.company_id && branch.company_id !== companyId) {
      throw new BadRequestException(this.t('fleet.branch_other_company', lang));
    }
  }

  private dateRange(from?: string, to?: string) {
    return {
      from: from ? new Date(`${from}T00:00:00`) : null,
      to: to ? new Date(`${to}T23:59:59.999`) : null,
    };
  }

  // ============================================================
  // VÉHICULES
  // ============================================================

  async createVehicle(dto: CreateVehicleDto, user: UserEntity, lang: string) {
    const companyId = await this.company(user, dto.companyId, lang);
    await this.checkBranch(dto.branchId, companyId, lang);
    await this.checkUser(dto.assignedDriverId, lang);
    const plate = dto.plateNumber.trim().toUpperCase();
    const dup = await this.dataSource.manager.count(FleetVehicle, { where: { companyId, plateNumber: plate } });
    if (dup) throw new ConflictException(this.t('fleet.plate_exists', lang, { plate }));

    const vehicle = await this.dataSource.manager.save(
      FleetVehicle,
      this.dataSource.manager.create(FleetVehicle, {
        ...dto,
        companyId,
        plateNumber: plate,
        mileage: dto.mileage ?? 0,
        status: FleetVehicleStatus.AVAILABLE,
        createdById: user?.id ?? null,
      }),
    );
    return { message: this.t('fleet.vehicle_created', lang, { plate }), data: vehicle };
  }

  async updateVehicle(id: string, dto: UpdateVehicleDto, user: UserEntity, lang: string) {
    const vehicle = await this.getVehicle(id, user, lang);
    if (dto.companyId && dto.companyId !== vehicle.companyId) {
      throw new BadRequestException(this.t('fleet.company_change_forbidden', lang));
    }
    await this.checkBranch(dto.branchId, vehicle.companyId, lang);
    await this.checkUser(dto.assignedDriverId, lang);
    if (dto.plateNumber) {
      const plate = dto.plateNumber.trim().toUpperCase();
      const dup = await this.dataSource.manager.count(FleetVehicle, {
        where: { companyId: vehicle.companyId, plateNumber: plate, id: Not(id) },
      });
      if (dup) throw new ConflictException(this.t('fleet.plate_exists', lang, { plate }));
      dto.plateNumber = plate;
    }
    if (dto.mileage !== undefined && dto.mileage < vehicle.mileage) {
      throw new BadRequestException(this.t('fleet.mileage_decrease', lang, { current: vehicle.mileage }));
    }
    const { companyId: _c, ...data } = dto;
    Object.assign(vehicle, data);
    const saved = await this.dataSource.manager.save(FleetVehicle, vehicle);
    return { message: this.t('fleet.vehicle_updated', lang), data: saved };
  }

  async assignDriver(id: string, dto: AssignDriverDto, user: UserEntity, lang: string) {
    const vehicle = await this.getVehicle(id, user, lang);
    await this.checkUser(dto.driverId, lang);
    vehicle.assignedDriverId = dto.driverId ?? null;
    await this.dataSource.manager.save(FleetVehicle, vehicle);
    return { message: this.t('fleet.driver_assigned', lang), data: await this.dataSource.manager.findOne(FleetVehicle, { where: { id }, relations: ['assignedDriver'] }) };
  }

  /** Sortie du parc (le véhicule et son historique sont conservés) */
  async retireVehicle(id: string, user: UserEntity, lang: string) {
    const vehicle = await this.getVehicle(id, user, lang);
    if (vehicle.status === FleetVehicleStatus.IN_MISSION) {
      throw new BadRequestException(this.t('fleet.vehicle_busy', lang));
    }
    vehicle.status = FleetVehicleStatus.RETIRED;
    await this.dataSource.manager.save(FleetVehicle, vehicle);
    return { message: this.t('fleet.vehicle_retired', lang), data: vehicle };
  }

  async listVehicles(query: VehicleQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.company(user, query.companyId, lang);
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const qb = this.dataSource.manager
      .createQueryBuilder(FleetVehicle, 'v')
      .leftJoinAndSelect('v.branch', 'branch')
      .leftJoin('v.assignedDriver', 'driver')
      .addSelect(['driver.id', 'driver.fullName', 'driver.phone'])
      .where('v.companyId = :companyId', { companyId });
    if (query.branchId) qb.andWhere('v.branchId = :branchId', { branchId: query.branchId });
    if (query.status) qb.andWhere('v.status = :status', { status: query.status });
    else qb.andWhere('v.status != :retired', { retired: FleetVehicleStatus.RETIRED });
    if (query.type) qb.andWhere('v.type = :type', { type: query.type });
    if (query.search?.trim()) {
      const kw = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('LOWER(v.plateNumber) LIKE :kw', { kw })
            .orWhere('LOWER(v.brand) LIKE :kw', { kw })
            .orWhere('LOWER(v.model) LIKE :kw', { kw })
            .orWhere('LOWER(driver.fullName) LIKE :kw', { kw }),
        ),
      );
    }
    const [items, total] = await qb.orderBy('v.plateNumber', 'ASC').skip(skip).take(limit).getManyAndCount();
    return { message: this.t('fleet.vehicles', lang), data: new PaginatedResponseDto(items, total, page, limit) };
  }

  /** Fiche complète d'un véhicule avec son historique */
  async vehicleDetail(id: string, user: UserEntity, lang: string) {
    await this.getVehicle(id, user, lang);
    const m = this.dataSource.manager;
    const vehicle = await m.findOne(FleetVehicle, { where: { id }, relations: ['branch', 'assignedDriver'] });
    const [missions, fuel, maintenances, documents] = await Promise.all([
      m.find(FleetMission, { where: { vehicleId: id }, relations: ['driver'], order: { createdAt: 'DESC' }, take: 20 }),
      m.find(FleetFuelLog, { where: { vehicleId: id }, order: { filledAt: 'DESC' }, take: 20 }),
      m.find(FleetMaintenance, { where: { vehicleId: id }, order: { createdAt: 'DESC' }, take: 20 }),
      m.find(FleetDocument, { where: { vehicleId: id }, order: { expiryDate: 'ASC' } }),
    ]);
    const fuelTotals = await m
      .createQueryBuilder(FleetFuelLog, 'f')
      .select('COALESCE(SUM(f.liters), 0)', 'liters')
      .addSelect('COALESCE(SUM(f.totalCost), 0)', 'cost')
      .where('f.vehicleId = :id', { id })
      .getRawOne();
    const maintenanceCost = await m
      .createQueryBuilder(FleetMaintenance, 'mt')
      .select('COALESCE(SUM(mt.cost), 0)', 'cost')
      .where('mt.vehicleId = :id', { id })
      .andWhere('mt.status = :done', { done: FleetMaintenanceStatus.COMPLETED })
      .getRawOne();
    return {
      message: this.t('fleet.vehicle_detail', lang),
      data: {
        vehicle,
        totals: {
          fuelLiters: Number(fuelTotals?.liters ?? 0),
          fuelCost: Number(fuelTotals?.cost ?? 0),
          maintenanceCost: Number(maintenanceCost?.cost ?? 0),
        },
        missions,
        fuel,
        maintenances,
        documents,
      },
    };
  }

  // ============================================================
  // MISSIONS
  // ============================================================

  /** Crée une mission (utilisé aussi par les transferts inter-branches) */
  async createMissionInternal(
    m: EntityManager,
    vehicle: FleetVehicle,
    data: Partial<FleetMission>,
    user: UserEntity | null,
  ): Promise<FleetMission> {
    return m.save(
      FleetMission,
      m.create(FleetMission, {
        reference: reference('MIS'),
        companyId: vehicle.companyId,
        vehicleId: vehicle.id,
        driverId: data.driverId ?? vehicle.assignedDriverId ?? null,
        type: data.type ?? FleetMissionType.OTHER,
        purpose: data.purpose ?? '-',
        origin: data.origin ?? null,
        destination: data.destination ?? null,
        plannedStartAt: data.plannedStartAt ?? null,
        plannedEndAt: data.plannedEndAt ?? null,
        transferId: data.transferId ?? null,
        status: FleetMissionStatus.PLANNED,
        notes: data.notes ?? null,
        createdById: user?.id ?? null,
      }),
    );
  }

  async createMission(dto: CreateMissionDto, user: UserEntity, lang: string) {
    const vehicle = await this.getVehicle(dto.vehicleId, user, lang);
    if ([FleetVehicleStatus.RETIRED, FleetVehicleStatus.OUT_OF_SERVICE].includes(vehicle.status)) {
      throw new BadRequestException(this.t('fleet.vehicle_unavailable', lang, { status: vehicle.status }));
    }
    await this.checkUser(dto.driverId, lang);
    const mission = await this.createMissionInternal(this.dataSource.manager, vehicle, {
      ...dto,
      plannedStartAt: dto.plannedStartAt ? new Date(dto.plannedStartAt) : null,
      plannedEndAt: dto.plannedEndAt ? new Date(dto.plannedEndAt) : null,
    } as Partial<FleetMission>, user);
    return { message: this.t('fleet.mission_created', lang, { reference: mission.reference }), data: mission };
  }

  private async getMission(id: string, user: UserEntity, lang: string): Promise<FleetMission> {
    const mission = await this.dataSource.manager.findOne(FleetMission, { where: { id } });
    if (!mission) throw new NotFoundException(this.t('fleet.mission_not_found', lang));
    await this.company(user, mission.companyId, lang);
    return mission;
  }

  /** Départ : le véhicule passe « en mission » */
  async startMissionInternal(m: EntityManager, mission: FleetMission, startMileage: number | null | undefined, lang: string) {
    if (mission.status !== FleetMissionStatus.PLANNED) {
      throw new BadRequestException(this.t('fleet.mission_bad_status', lang, { status: mission.status }));
    }
    const vehicle = await m.findOne(FleetVehicle, { where: { id: mission.vehicleId }, lock: { mode: 'pessimistic_write' } });
    if (!vehicle) throw new NotFoundException(this.t('fleet.vehicle_not_found', lang));
    if (vehicle.status !== FleetVehicleStatus.AVAILABLE) {
      throw new BadRequestException(this.t('fleet.vehicle_unavailable', lang, { status: vehicle.status }));
    }
    mission.status = FleetMissionStatus.IN_PROGRESS;
    mission.startedAt = new Date();
    mission.startMileage = startMileage ?? vehicle.mileage;
    vehicle.status = FleetVehicleStatus.IN_MISSION;
    await m.save(FleetVehicle, vehicle);
    return m.save(FleetMission, mission);
  }

  /** Retour : kilométrage, distance, véhicule à nouveau disponible */
  async completeMissionInternal(m: EntityManager, mission: FleetMission, endMileage: number | null | undefined, lang: string) {
    if (mission.status !== FleetMissionStatus.IN_PROGRESS) {
      throw new BadRequestException(this.t('fleet.mission_bad_status', lang, { status: mission.status }));
    }
    const vehicle = await m.findOne(FleetVehicle, { where: { id: mission.vehicleId }, lock: { mode: 'pessimistic_write' } });
    if (!vehicle) throw new NotFoundException(this.t('fleet.vehicle_not_found', lang));
    const end = endMileage ?? vehicle.mileage;
    if (mission.startMileage !== null && mission.startMileage !== undefined && end < mission.startMileage) {
      throw new BadRequestException(this.t('fleet.mileage_decrease', lang, { current: mission.startMileage }));
    }
    mission.status = FleetMissionStatus.COMPLETED;
    mission.endedAt = new Date();
    mission.endMileage = end;
    mission.distanceKm = mission.startMileage !== null && mission.startMileage !== undefined ? end - mission.startMileage : null;
    if (end > vehicle.mileage) vehicle.mileage = end;
    if (vehicle.status === FleetVehicleStatus.IN_MISSION) vehicle.status = FleetVehicleStatus.AVAILABLE;
    await m.save(FleetVehicle, vehicle);
    return m.save(FleetMission, mission);
  }

  async cancelMissionInternal(m: EntityManager, mission: FleetMission, reason: string) {
    if ([FleetMissionStatus.COMPLETED, FleetMissionStatus.CANCELLED].includes(mission.status)) return mission;
    if (mission.status === FleetMissionStatus.IN_PROGRESS) {
      const vehicle = await m.findOne(FleetVehicle, { where: { id: mission.vehicleId } });
      if (vehicle && vehicle.status === FleetVehicleStatus.IN_MISSION) {
        vehicle.status = FleetVehicleStatus.AVAILABLE;
        await m.save(FleetVehicle, vehicle);
      }
    }
    mission.status = FleetMissionStatus.CANCELLED;
    mission.notes = [mission.notes, `Annulée : ${reason}`].filter(Boolean).join('\n');
    return m.save(FleetMission, mission);
  }

  async startMission(id: string, dto: StartMissionDto, user: UserEntity, lang: string) {
    const mission = await this.getMission(id, user, lang);
    const saved = await this.dataSource.transaction((m) => this.startMissionInternal(m, mission, dto.startMileage, lang));
    return { message: this.t('fleet.mission_started', lang), data: saved };
  }

  async completeMission(id: string, dto: CompleteMissionDto, user: UserEntity, lang: string) {
    const mission = await this.getMission(id, user, lang);
    if (dto.note) mission.notes = [mission.notes, dto.note].filter(Boolean).join('\n');
    const saved = await this.dataSource.transaction((m) => this.completeMissionInternal(m, mission, dto.endMileage, lang));
    return { message: this.t('fleet.mission_completed', lang, { distance: saved.distanceKm ?? 0 }), data: saved };
  }

  async cancelMission(id: string, dto: CancelDto, user: UserEntity, lang: string) {
    const mission = await this.getMission(id, user, lang);
    if (mission.transferId) throw new BadRequestException(this.t('fleet.mission_linked_transfer', lang));
    const saved = await this.dataSource.transaction((m) => this.cancelMissionInternal(m, mission, dto.reason));
    return { message: this.t('fleet.mission_cancelled', lang), data: saved };
  }

  async listMissions(query: MissionQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.company(user, query.companyId, lang);
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const { from, to } = this.dateRange(query.from, query.to);
    const qb = this.dataSource.manager
      .createQueryBuilder(FleetMission, 'mi')
      .leftJoinAndSelect('mi.vehicle', 'vehicle')
      .leftJoin('mi.driver', 'driver')
      .addSelect(['driver.id', 'driver.fullName', 'driver.phone'])
      .where('mi.companyId = :companyId', { companyId });
    if (query.vehicleId) qb.andWhere('mi.vehicleId = :vehicleId', { vehicleId: query.vehicleId });
    if (query.driverId) qb.andWhere('mi.driverId = :driverId', { driverId: query.driverId });
    if (query.status) qb.andWhere('mi.status = :status', { status: query.status });
    if (query.type) qb.andWhere('mi.type = :type', { type: query.type });
    if (from) qb.andWhere('mi.createdAt >= :from', { from });
    if (to) qb.andWhere('mi.createdAt <= :to', { to });
    const [items, total] = await qb.orderBy('mi.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
    return { message: this.t('fleet.missions', lang), data: new PaginatedResponseDto(items, total, page, limit) };
  }

  // ============================================================
  // CARBURANT
  // ============================================================

  async addFuel(dto: CreateFuelLogDto, user: UserEntity, lang: string) {
    const vehicle = await this.getVehicle(dto.vehicleId, user, lang);
    await this.checkUser(dto.driverId, lang);
    const totalCost = Math.round(dto.liters * dto.unitPrice * 100) / 100;
    const log = await this.dataSource.transaction(async (m) => {
      const saved = await m.save(
        FleetFuelLog,
        m.create(FleetFuelLog, {
          ...dto,
          companyId: vehicle.companyId,
          filledAt: dto.filledAt ? new Date(dto.filledAt) : new Date(),
          totalCost,
          currency: dto.currency || 'USD',
          fullTank: dto.fullTank ?? true,
          driverId: dto.driverId ?? vehicle.assignedDriverId ?? null,
          createdById: user?.id ?? null,
        }),
      );
      if (dto.mileage && dto.mileage > vehicle.mileage) {
        await m.update(FleetVehicle, { id: vehicle.id }, { mileage: dto.mileage });
      }
      return saved;
    });
    return { message: this.t('fleet.fuel_added', lang, { liters: dto.liters, cost: totalCost }), data: log };
  }

  async listFuel(query: FuelQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.company(user, query.companyId, lang);
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const { from, to } = this.dateRange(query.from, query.to);
    const qb = this.dataSource.manager
      .createQueryBuilder(FleetFuelLog, 'f')
      .leftJoinAndSelect('f.vehicle', 'vehicle')
      .leftJoin('f.driver', 'driver')
      .addSelect(['driver.id', 'driver.fullName'])
      .where('f.companyId = :companyId', { companyId });
    if (query.vehicleId) qb.andWhere('f.vehicleId = :vehicleId', { vehicleId: query.vehicleId });
    if (from) qb.andWhere('f.filledAt >= :from', { from });
    if (to) qb.andWhere('f.filledAt <= :to', { to });

    const totals = await qb.clone().select('COALESCE(SUM(f.liters), 0)', 'liters').addSelect('COALESCE(SUM(f.totalCost), 0)', 'cost').getRawOne();
    const [items, total] = await qb.orderBy('f.filledAt', 'DESC').skip(skip).take(limit).getManyAndCount();
    return {
      message: this.t('fleet.fuel_logs', lang),
      data: {
        ...new PaginatedResponseDto(items, total, page, limit),
        totals: { liters: Number(totals?.liters ?? 0), cost: Number(totals?.cost ?? 0) },
      },
    };
  }

  async deleteFuel(id: string, user: UserEntity, lang: string) {
    const log = await this.dataSource.manager.findOne(FleetFuelLog, { where: { id } });
    if (!log) throw new NotFoundException(this.t('fleet.fuel_not_found', lang));
    await this.company(user, log.companyId, lang);
    await this.dataSource.manager.delete(FleetFuelLog, { id });
    return { message: this.t('fleet.fuel_deleted', lang), data: { id } };
  }

  // ============================================================
  // ENTRETIEN / PANNES
  // ============================================================

  async createMaintenance(dto: CreateMaintenanceDto, user: UserEntity, lang: string) {
    const vehicle = await this.getVehicle(dto.vehicleId, user, lang);
    const result = await this.dataSource.transaction(async (m) => {
      const { startNow, ...data } = dto;
      const maint = await m.save(
        FleetMaintenance,
        m.create(FleetMaintenance, {
          ...data,
          companyId: vehicle.companyId,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          currency: dto.currency || 'USD',
          status: startNow ? FleetMaintenanceStatus.IN_PROGRESS : FleetMaintenanceStatus.SCHEDULED,
          startedAt: startNow ? new Date() : null,
          mileage: dto.mileage ?? vehicle.mileage,
          createdById: user?.id ?? null,
        }),
      );
      if (startNow) {
        if (vehicle.status === FleetVehicleStatus.IN_MISSION) throw new BadRequestException(this.t('fleet.vehicle_busy', lang));
        await m.update(FleetVehicle, { id: vehicle.id }, { status: FleetVehicleStatus.MAINTENANCE });
      }
      return maint;
    });
    return { message: this.t('fleet.maintenance_created', lang), data: result };
  }

  private async getMaintenance(id: string, user: UserEntity, lang: string) {
    const maint = await this.dataSource.manager.findOne(FleetMaintenance, { where: { id } });
    if (!maint) throw new NotFoundException(this.t('fleet.maintenance_not_found', lang));
    await this.company(user, maint.companyId, lang);
    return maint;
  }

  async startMaintenance(id: string, user: UserEntity, lang: string) {
    const maint = await this.getMaintenance(id, user, lang);
    if (maint.status !== FleetMaintenanceStatus.SCHEDULED) {
      throw new BadRequestException(this.t('fleet.maintenance_bad_status', lang, { status: maint.status }));
    }
    const saved = await this.dataSource.transaction(async (m) => {
      const vehicle = await m.findOne(FleetVehicle, { where: { id: maint.vehicleId } });
      if (vehicle?.status === FleetVehicleStatus.IN_MISSION) throw new BadRequestException(this.t('fleet.vehicle_busy', lang));
      maint.status = FleetMaintenanceStatus.IN_PROGRESS;
      maint.startedAt = new Date();
      await m.update(FleetVehicle, { id: maint.vehicleId }, { status: FleetVehicleStatus.MAINTENANCE });
      return m.save(FleetMaintenance, maint);
    });
    return { message: this.t('fleet.maintenance_started', lang), data: saved };
  }

  async completeMaintenance(id: string, dto: CompleteMaintenanceDto, user: UserEntity, lang: string) {
    const maint = await this.getMaintenance(id, user, lang);
    if (![FleetMaintenanceStatus.SCHEDULED, FleetMaintenanceStatus.IN_PROGRESS].includes(maint.status)) {
      throw new BadRequestException(this.t('fleet.maintenance_bad_status', lang, { status: maint.status }));
    }
    const saved = await this.dataSource.transaction(async (m) => {
      Object.assign(maint, {
        cost: dto.cost ?? maint.cost,
        mileage: dto.mileage ?? maint.mileage,
        nextDueDate: dto.nextDueDate ?? maint.nextDueDate,
        nextDueMileage: dto.nextDueMileage ?? maint.nextDueMileage,
        description: dto.description ?? maint.description,
        status: FleetMaintenanceStatus.COMPLETED,
        startedAt: maint.startedAt ?? new Date(),
        completedAt: new Date(),
      });
      const vehicle = await m.findOne(FleetVehicle, { where: { id: maint.vehicleId } });
      if (vehicle) {
        // Le véhicule redevient disponible s'il n'a pas d'autre entretien en cours
        const others = await m.count(FleetMaintenance, {
          where: { vehicleId: vehicle.id, status: FleetMaintenanceStatus.IN_PROGRESS, id: Not(maint.id) },
        });
        if (!others && vehicle.status === FleetVehicleStatus.MAINTENANCE) vehicle.status = FleetVehicleStatus.AVAILABLE;
        if (dto.mileage && dto.mileage > vehicle.mileage) vehicle.mileage = dto.mileage;
        await m.save(FleetVehicle, vehicle);
      }
      return m.save(FleetMaintenance, maint);
    });
    return { message: this.t('fleet.maintenance_completed', lang), data: saved };
  }

  async cancelMaintenance(id: string, dto: CancelDto, user: UserEntity, lang: string) {
    const maint = await this.getMaintenance(id, user, lang);
    if ([FleetMaintenanceStatus.COMPLETED, FleetMaintenanceStatus.CANCELLED].includes(maint.status)) {
      throw new BadRequestException(this.t('fleet.maintenance_bad_status', lang, { status: maint.status }));
    }
    const saved = await this.dataSource.transaction(async (m) => {
      const wasInProgress = maint.status === FleetMaintenanceStatus.IN_PROGRESS;
      maint.status = FleetMaintenanceStatus.CANCELLED;
      maint.description = [maint.description, `Annulé : ${dto.reason}`].filter(Boolean).join('\n');
      if (wasInProgress) {
        await m.update(
          FleetVehicle,
          { id: maint.vehicleId, status: FleetVehicleStatus.MAINTENANCE },
          { status: FleetVehicleStatus.AVAILABLE },
        );
      }
      return m.save(FleetMaintenance, maint);
    });
    return { message: this.t('fleet.maintenance_cancelled', lang), data: saved };
  }

  async listMaintenance(query: MaintenanceQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.company(user, query.companyId, lang);
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const where: any = { companyId };
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    const [items, total] = await this.dataSource.manager.findAndCount(FleetMaintenance, {
      where,
      relations: ['vehicle'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return { message: this.t('fleet.maintenances', lang), data: new PaginatedResponseDto(items, total, page, limit) };
  }

  // ============================================================
  // DOCUMENTS
  // ============================================================

  async createDocument(dto: CreateDocumentDto, user: UserEntity, lang: string) {
    const vehicle = await this.getVehicle(dto.vehicleId, user, lang);
    const doc = await this.dataSource.manager.save(
      FleetDocument,
      this.dataSource.manager.create(FleetDocument, { ...dto, companyId: vehicle.companyId }),
    );
    return { message: this.t('fleet.document_created', lang), data: doc };
  }

  private async getDocument(id: string, user: UserEntity, lang: string) {
    const doc = await this.dataSource.manager.findOne(FleetDocument, { where: { id } });
    if (!doc) throw new NotFoundException(this.t('fleet.document_not_found', lang));
    await this.company(user, doc.companyId, lang);
    return doc;
  }

  async updateDocument(id: string, dto: UpdateDocumentDto, user: UserEntity, lang: string) {
    const doc = await this.getDocument(id, user, lang);
    if (dto.vehicleId && dto.vehicleId !== doc.vehicleId) {
      const vehicle = await this.getVehicle(dto.vehicleId, user, lang);
      if (vehicle.companyId !== doc.companyId) throw new BadRequestException(this.t('fleet.company_change_forbidden', lang));
    }
    Object.assign(doc, dto);
    return { message: this.t('fleet.document_updated', lang), data: await this.dataSource.manager.save(FleetDocument, doc) };
  }

  async deleteDocument(id: string, user: UserEntity, lang: string) {
    await this.getDocument(id, user, lang);
    await this.dataSource.manager.delete(FleetDocument, { id });
    return { message: this.t('fleet.document_deleted', lang), data: { id } };
  }

  async listDocuments(query: DocumentQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.company(user, query.companyId, lang);
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const where: any = { companyId };
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.type) where.type = query.type;
    if (query.expiringInDays !== undefined) {
      const limitDate = new Date(Date.now() + Number(query.expiringInDays) * 86400000).toISOString().slice(0, 10);
      where.expiryDate = LessThanOrEqual(limitDate);
    }
    const [items, total] = await this.dataSource.manager.findAndCount(FleetDocument, {
      where,
      relations: ['vehicle'],
      order: { expiryDate: 'ASC' },
      skip,
      take: limit,
    });
    return { message: this.t('fleet.documents', lang), data: new PaginatedResponseDto(items, total, page, limit) };
  }

  // ============================================================
  // TABLEAU DE BORD
  // ============================================================

  async dashboard(user: UserEntity, lang: string, companyIdParam?: string) {
    const companyId = await this.company(user, companyIdParam, lang);
    const m = this.dataSource.manager;
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const byStatus = await m
      .createQueryBuilder(FleetVehicle, 'v')
      .select('v.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('v.companyId = :companyId', { companyId })
      .groupBy('v.status')
      .getRawMany();

    const [expiringDocs, expiredDocs, missionsInProgress, maintenanceOpen, upcomingMaintenance] = await Promise.all([
      m.find(FleetDocument, {
        where: { companyId, expiryDate: LessThanOrEqual(in30) },
        relations: ['vehicle'],
        order: { expiryDate: 'ASC' },
        take: 50,
      }),
      m.count(FleetDocument, { where: { companyId, expiryDate: LessThanOrEqual(today) } }),
      m.find(FleetMission, {
        where: { companyId, status: FleetMissionStatus.IN_PROGRESS },
        relations: ['vehicle', 'driver'],
        order: { startedAt: 'DESC' },
      }),
      m.count(FleetMaintenance, { where: { companyId, status: In([FleetMaintenanceStatus.SCHEDULED, FleetMaintenanceStatus.IN_PROGRESS]) } }),
      m
        .createQueryBuilder(FleetMaintenance, 'mt')
        .leftJoinAndSelect('mt.vehicle', 'vehicle')
        .where('mt.companyId = :companyId', { companyId })
        .andWhere('mt.status = :done', { done: FleetMaintenanceStatus.COMPLETED })
        .andWhere('(mt.nextDueDate <= :in30 OR (mt.nextDueMileage IS NOT NULL AND mt.nextDueMileage <= vehicle.mileage + 500))', { in30 })
        .orderBy('mt.nextDueDate', 'ASC')
        .take(50)
        .getMany(),
    ]);

    const fuelMonth = await m
      .createQueryBuilder(FleetFuelLog, 'f')
      .select('COALESCE(SUM(f.liters), 0)', 'liters')
      .addSelect('COALESCE(SUM(f.totalCost), 0)', 'cost')
      .where('f.companyId = :companyId', { companyId })
      .andWhere('f.filledAt >= :monthStart', { monthStart })
      .getRawOne();
    const maintenanceMonth = await m
      .createQueryBuilder(FleetMaintenance, 'mt')
      .select('COALESCE(SUM(mt.cost), 0)', 'cost')
      .where('mt.companyId = :companyId', { companyId })
      .andWhere('mt.completedAt >= :monthStart', { monthStart })
      .getRawOne();
    const distanceMonth = await m
      .createQueryBuilder(FleetMission, 'mi')
      .select('COALESCE(SUM(mi.distanceKm), 0)', 'km')
      .where('mi.companyId = :companyId', { companyId })
      .andWhere('mi.endedAt >= :monthStart', { monthStart })
      .getRawOne();

    return {
      message: this.t('fleet.dashboard', lang),
      data: {
        vehicles: byStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
        missionsInProgress,
        maintenanceOpen,
        upcomingMaintenance,
        documents: { expiringIn30Days: expiringDocs, expiredCount: expiredDocs },
        month: {
          fuelLiters: Number(fuelMonth?.liters ?? 0),
          fuelCost: Number(fuelMonth?.cost ?? 0),
          maintenanceCost: Number(maintenanceMonth?.cost ?? 0),
          distanceKm: Number(distanceMonth?.km ?? 0),
        },
      },
    };
  }
}
