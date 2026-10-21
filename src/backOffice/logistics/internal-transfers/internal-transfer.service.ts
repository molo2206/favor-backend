import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { ShipmentTracking } from 'src/shipment/entity/shipment_tracking.entity';
import { ShipmentStatus } from 'src/shipment/enum/shipment.dto';
import { BranchStockService } from 'src/branch-stock/branch-stock.service';
import { BranchParcelStock } from 'src/branch-stock/entities/branch-parcel-stock.entity';
import { BranchMovementType } from 'src/branch-stock/enums/branch-stock.enum';
import { SupplyHistoryService } from 'src/supply/supply-history.service';
import { SupplyEventType } from 'src/supply/enums/supply.enum';
import {
  FleetMissionStatus,
  FleetMissionType,
  FleetVehicleStatus,
  InternalTransferStatus,
} from '../common/logistics.enums';
import { isPlatformAdmin, pageParams, reference, resolveCompanyId } from '../common/logistics-access';
import { FleetService } from '../fleet/fleet.service';
import { FleetMission } from '../fleet/entities/fleet-mission.entity';
import { InternalTransfer } from './entities/internal-transfer.entity';
import { InternalTransferItem } from './entities/internal-transfer-item.entity';
import {
  CancelTransferDto,
  CreateTransferDto,
  DispatchTransferDto,
  ReceiveTransferDto,
  TransferItemInputDto,
  TransferQueryDto,
  UpdateTransferDto,
} from './dto/internal-transfer.dto';

/**
 * Logistique interne : transferts de colis entre branches.
 * DRAFT → (dispatch) IN_TRANSIT → (receive) RECEIVED | PARTIALLY_RECEIVED
 * Chaque étape écrit dans le pointage des branches, le tracking du shipment
 * et l'historique Supply.
 */
@Injectable()
export class InternalTransferService {
  private readonly logger = new Logger(InternalTransferService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly branchStock: BranchStockService,
    private readonly supplyHistory: SupplyHistoryService,
    private readonly fleet: FleetService,
  ) { }

  private t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params);
  }

  private label(branch: BranchEntity): string {
    return `${branch.name}${branch.address ? ` — ${branch.address}` : ''}`;
  }

  private async load(id: string, m?: EntityManager): Promise<InternalTransfer | null> {
    return (m ?? this.dataSource.manager).findOne(InternalTransfer, {
      where: { id },
      relations: ['items', 'fromBranch', 'toBranch', 'vehicle', 'driver', 'mission'],
    });
  }

  /** Le transfert + droit : accès à la branche d'origine OU de destination */
  private async getTransfer(id: string, user: UserEntity, lang: string): Promise<InternalTransfer> {
    const transfer = await this.load(id);
    if (!transfer) throw new NotFoundException(this.t('transfer.not_found', lang));
    if (isPlatformAdmin(user)) return transfer;
    try {
      await this.branchStock.assertBranchAccess(user, transfer.fromBranchId, lang);
      return transfer;
    } catch {
      await this.branchStock.assertBranchAccess(user, transfer.toBranchId, lang);
      return transfer;
    }
  }

  /** Résout et vérifie les lignes : le colis doit être en stock dans la branche d'origine */
  private async resolveItems(
    m: EntityManager,
    fromBranchId: string,
    items: TransferItemInputDto[],
    lang: string,
  ): Promise<Partial<InternalTransferItem>[]> {
    const out: Partial<InternalTransferItem>[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      let stock: BranchParcelStock | null = null;
      if (item.stockId) {
        stock = await m.findOne(BranchParcelStock, { where: { id: item.stockId } });
      } else if (item.shipmentId) {
        stock = await m.findOne(BranchParcelStock, { where: { branchId: fromBranchId, shipmentId: item.shipmentId } });
      } else if (item.trackingNumber) {
        stock = await m.findOne(BranchParcelStock, {
          where: { branchId: fromBranchId, trackingNumber: String(item.trackingNumber).trim() },
        });
      } else {
        throw new BadRequestException(this.t('transfer.item_required', lang));
      }
      const ref = item.stockId || item.shipmentId || item.trackingNumber;
      if (!stock || stock.branchId !== fromBranchId) {
        throw new BadRequestException(this.t('transfer.item_not_in_branch', lang, { tracking: ref }));
      }
      if (seen.has(stock.id)) throw new BadRequestException(this.t('transfer.item_duplicate', lang, { tracking: stock.trackingNumber }));
      seen.add(stock.id);

      const qty = item.quantity ?? stock.quantityAvailable;
      if (qty <= 0 || qty > stock.quantityAvailable) {
        throw new BadRequestException(
          this.t('branch_stock.insufficient_stock', lang, {
            available: stock.quantityAvailable,
            requested: qty,
            tracking: stock.trackingNumber,
          }),
        );
      }
      out.push({
        stockId: stock.id,
        shipmentId: stock.shipmentId,
        trackingNumber: stock.trackingNumber,
        quantity: qty,
        receivedQuantity: 0,
        note: item.note ?? null,
      });
    }
    return out;
  }

  private async checkVehicle(vehicleId: string | undefined | null, companyId: string, user: UserEntity, lang: string) {
    if (!vehicleId) return null;
    const vehicle = await this.fleet.getVehicle(vehicleId, user, lang);
    if (vehicle.companyId !== companyId) throw new BadRequestException(this.t('transfer.vehicle_other_company', lang));
    if ([FleetVehicleStatus.RETIRED, FleetVehicleStatus.OUT_OF_SERVICE].includes(vehicle.status)) {
      throw new BadRequestException(this.t('fleet.vehicle_unavailable', lang, { status: vehicle.status }));
    }
    return vehicle;
  }

  // ============================================================
  // CRÉATION / MODIFICATION (brouillon)
  // ============================================================

  async create(dto: CreateTransferDto, user: UserEntity, lang: string) {
    if (dto.fromBranchId === dto.toBranchId) throw new BadRequestException(this.t('transfer.same_branch', lang));
    const from = await this.branchStock.assertBranchAccess(user, dto.fromBranchId, lang);
    const to = await this.dataSource.manager.findOne(BranchEntity, { where: { id: dto.toBranchId } });
    if (!to || to.deleted) throw new NotFoundException(this.t('branch_stock.branch_not_found', lang));

    const companyId = from.company_id || user?.activeCompanyId;
    if (!companyId) throw new BadRequestException(this.t('fleet.company_required', lang));
    await this.checkVehicle(dto.vehicleId, companyId, user, lang);

    const transfer = await this.dataSource.transaction(async (m) => {
      const items = await this.resolveItems(m, from.id, dto.items, lang);
      const saved = await m.save(
        InternalTransfer,
        m.create(InternalTransfer, {
          reference: reference('TRF'),
          companyId,
          fromBranchId: from.id,
          toBranchId: to.id,
          vehicleId: dto.vehicleId ?? null,
          driverId: dto.driverId ?? null,
          plannedDepartureAt: dto.plannedDepartureAt ? new Date(dto.plannedDepartureAt) : null,
          notes: dto.notes ?? null,
          status: InternalTransferStatus.DRAFT,
          createdById: user?.id ?? null,
        }),
      );
      await m.save(InternalTransferItem, items.map((i) => m.create(InternalTransferItem, { ...i, transferId: saved.id })));
      return saved;
    });

    return {
      message: this.t('transfer.created', lang, { reference: transfer.reference, count: dto.items.length }),
      data: await this.load(transfer.id),
    };
  }

  async update(id: string, dto: UpdateTransferDto, user: UserEntity, lang: string) {
    const transfer = await this.getTransfer(id, user, lang);
    if (transfer.status !== InternalTransferStatus.DRAFT) {
      throw new BadRequestException(this.t('transfer.not_draft', lang));
    }
    await this.branchStock.assertBranchAccess(user, transfer.fromBranchId, lang);
    if (dto.vehicleId !== undefined) await this.checkVehicle(dto.vehicleId, transfer.companyId, user, lang);

    await this.dataSource.transaction(async (m) => {
      if (dto.items) {
        const items = await this.resolveItems(m, transfer.fromBranchId, dto.items, lang);
        await m.delete(InternalTransferItem, { transferId: transfer.id });
        await m.save(InternalTransferItem, items.map((i) => m.create(InternalTransferItem, { ...i, transferId: transfer.id })));
      }
      await m.update(InternalTransfer, { id: transfer.id }, {
        vehicleId: dto.vehicleId !== undefined ? dto.vehicleId : transfer.vehicleId,
        driverId: dto.driverId !== undefined ? dto.driverId : transfer.driverId,
        plannedDepartureAt: dto.plannedDepartureAt ? new Date(dto.plannedDepartureAt) : transfer.plannedDepartureAt,
        notes: dto.notes !== undefined ? dto.notes : transfer.notes,
      });
    });
    return { message: this.t('transfer.updated', lang), data: await this.load(transfer.id) };
  }

  // ============================================================
  // EXPÉDITION (sortie de la branche d'origine)
  // ============================================================

  async dispatch(id: string, dto: DispatchTransferDto, user: UserEntity, lang: string) {
    const transfer = await this.getTransfer(id, user, lang);
    if (transfer.status !== InternalTransferStatus.DRAFT) {
      throw new BadRequestException(this.t('transfer.not_draft', lang));
    }
    const from = await this.branchStock.assertBranchAccess(user, transfer.fromBranchId, lang);
    const to = transfer.toBranch;

    await this.dataSource.transaction(async (m) => {
      // 1) Sortie du stock d'origine (pointage OUT_TRANSFER, contrôle du disponible)
      for (const item of transfer.items) {
        await this.branchStock.applyMovement(m, item.stockId, BranchMovementType.OUT_TRANSFER, item.quantity, {
          reason: `Transfert ${transfer.reference} → ${to.name}`,
          note: dto.note ?? null,
          reference: transfer.reference,
          transferId: transfer.id,
          performedById: user?.id ?? null,
        }, lang);

        // 2) Tracking du shipment
        await m.save(ShipmentTracking, m.create(ShipmentTracking, {
          shipmentId: item.shipmentId,
          shipment: { id: item.shipmentId } as Shipment,
          status: ShipmentStatus.TRANSIT,
          location: this.label(from),
          comment: `Transfert ${transfer.reference} : ${item.quantity} pièce(s) envoyée(s) vers ${to.name}`,
        }));

        // 3) Historique Supply
        await this.supplyHistory.recordForShipment(item.shipmentId, {
          eventType: SupplyEventType.TRANSFER_DISPATCHED,
          description: `Transfert ${transfer.reference} : ${from.name} → ${to.name} (${item.quantity} pièce(s))`,
          branchId: from.id,
          location: this.label(from),
          payload: { transferId: transfer.id, reference: transfer.reference, quantity: item.quantity, toBranchId: to.id },
          performedById: user?.id ?? null,
        }, m);
      }

      // 4) Mission du véhicule (optionnelle)
      let missionId: string | null = transfer.missionId ?? null;
      const wantMission = dto.createMission ?? !!transfer.vehicleId;
      if (wantMission && transfer.vehicleId && !missionId) {
        const vehicle = await this.fleet.getVehicle(transfer.vehicleId, user, lang, m);
        const mission = await this.fleet.createMissionInternal(m, vehicle, {
          driverId: transfer.driverId ?? null,
          type: FleetMissionType.TRANSFER,
          purpose: `Transfert ${transfer.reference}`,
          origin: this.label(from),
          destination: this.label(to),
          transferId: transfer.id,
        }, user);
        await this.fleet.startMissionInternal(m, mission, dto.startMileage, lang);
        missionId = mission.id;
      }

      await m.update(InternalTransfer, { id: transfer.id }, {
        status: InternalTransferStatus.IN_TRANSIT,
        dispatchedAt: new Date(),
        dispatchedById: user?.id ?? null,
        missionId,
        notes: dto.note ? [transfer.notes, dto.note].filter(Boolean).join('\n') : transfer.notes,
      });
    });

    return { message: this.t('transfer.dispatched', lang, { reference: transfer.reference }), data: await this.load(transfer.id) };
  }

  // ============================================================
  // RÉCEPTION (entrée dans la branche de destination)
  // ============================================================

  async receive(id: string, dto: ReceiveTransferDto, user: UserEntity, lang: string) {
    const transfer = await this.getTransfer(id, user, lang);
    if (transfer.status !== InternalTransferStatus.IN_TRANSIT) {
      throw new BadRequestException(this.t('transfer.not_in_transit', lang));
    }
    const to = await this.branchStock.assertBranchAccess(user, transfer.toBranchId, lang);
    const from = transfer.fromBranch;

    const received = new Map<string, { qty: number; note?: string }>();
    if (dto.items?.length) {
      for (const r of dto.items) {
        const item = transfer.items.find((i) => i.id === r.itemId);
        if (!item) throw new BadRequestException(this.t('transfer.item_unknown', lang, { id: r.itemId }));
        if (r.receivedQuantity > item.quantity) {
          throw new BadRequestException(this.t('transfer.received_exceeds', lang, { tracking: item.trackingNumber, sent: item.quantity }));
        }
        received.set(item.id, { qty: r.receivedQuantity, note: r.note });
      }
    }

    let allComplete = true;
    await this.dataSource.transaction(async (m) => {
      for (const item of transfer.items) {
        // Ligne non mentionnée = tout reçu
        const r = dto.items?.length ? received.get(item.id) ?? { qty: item.quantity } : { qty: item.quantity };
        if (r.qty < item.quantity) allComplete = false;

        const shipment = await m.findOne(Shipment, { where: { id: item.shipmentId }, relations: ['package', 'user'] });
        if (!shipment) continue;
        const origin = await m.findOne(BranchParcelStock, { where: { id: item.stockId } });

        const destStock = await this.branchStock.getOrCreateStock(m, to, shipment, {
          ltaId: origin?.ltaId ?? null,
          location: dto.location ?? null,
          receivedById: user?.id ?? null,
        });
        if (r.qty > 0) {
          await this.branchStock.applyMovement(m, destStock.id, BranchMovementType.IN_TRANSFER, r.qty, {
            reason: `Transfert ${transfer.reference} depuis ${from.name}`,
            note: r.note ?? dto.note ?? null,
            reference: transfer.reference,
            transferId: transfer.id,
            performedById: user?.id ?? null,
          }, lang);
        }
        await m.update(InternalTransferItem, { id: item.id }, {
          receivedQuantity: r.qty,
          destinationStockId: destStock.id,
          note: r.note ?? item.note ?? null,
        });

        const missing = item.quantity - r.qty;
        await m.save(ShipmentTracking, m.create(ShipmentTracking, {
          shipmentId: item.shipmentId,
          shipment: { id: item.shipmentId } as Shipment,
          status: ShipmentStatus.ARRIVED_DESTINATION,
          location: this.label(to),
          comment: `Transfert ${transfer.reference} : ${r.qty}/${item.quantity} pièce(s) reçue(s) à ${to.name}${missing > 0 ? ` (${missing} manquante(s))` : ''}`,
        }));

        await this.supplyHistory.recordForShipment(item.shipmentId, {
          eventType: SupplyEventType.TRANSFER_RECEIVED,
          description: `Transfert ${transfer.reference} reçu à ${to.name} : ${r.qty}/${item.quantity} pièce(s)`,
          branchId: to.id,
          location: this.label(to),
          payload: { transferId: transfer.id, reference: transfer.reference, sent: item.quantity, received: r.qty, fromBranchId: from.id },
          performedById: user?.id ?? null,
        }, m);
      }

      // Fin de la mission du véhicule
      if (transfer.missionId) {
        const mission = await m.findOne(FleetMission, { where: { id: transfer.missionId } });
        if (mission?.status === FleetMissionStatus.IN_PROGRESS) {
          await this.fleet.completeMissionInternal(m, mission, dto.endMileage, lang);
        }
      }

      await m.update(InternalTransfer, { id: transfer.id }, {
        status: allComplete ? InternalTransferStatus.RECEIVED : InternalTransferStatus.PARTIALLY_RECEIVED,
        receivedAt: new Date(),
        receivedById: user?.id ?? null,
        notes: dto.note ? [transfer.notes, dto.note].filter(Boolean).join('\n') : transfer.notes,
      });
    });

    return {
      message: this.t(allComplete ? 'transfer.received' : 'transfer.partially_received', lang, { reference: transfer.reference }),
      data: await this.load(transfer.id),
    };
  }

  // ============================================================
  // ANNULATION
  // ============================================================

  async cancel(id: string, dto: CancelTransferDto, user: UserEntity, lang: string) {
    const transfer = await this.getTransfer(id, user, lang);
    if (![InternalTransferStatus.DRAFT, InternalTransferStatus.IN_TRANSIT].includes(transfer.status)) {
      throw new BadRequestException(this.t('transfer.cannot_cancel', lang));
    }
    const from = await this.branchStock.assertBranchAccess(user, transfer.fromBranchId, lang);

    await this.dataSource.transaction(async (m) => {
      if (transfer.status === InternalTransferStatus.IN_TRANSIT) {
        // Les pièces reviennent dans la branche d'origine
        for (const item of transfer.items) {
          await this.branchStock.applyMovement(m, item.stockId, BranchMovementType.IN_TRANSFER, item.quantity, {
            reason: `Annulation transfert ${transfer.reference} : ${dto.reason}`,
            reference: transfer.reference,
            transferId: transfer.id,
            performedById: user?.id ?? null,
          }, lang);
          await m.save(ShipmentTracking, m.create(ShipmentTracking, {
            shipmentId: item.shipmentId,
            shipment: { id: item.shipmentId } as Shipment,
            status: ShipmentStatus.AT_ORIGIN_AGENCY,
            location: this.label(from),
            comment: `Transfert ${transfer.reference} annulé, colis de retour à ${from.name}`,
          }));
          await this.supplyHistory.recordForShipment(item.shipmentId, {
            eventType: SupplyEventType.NOTE,
            description: `Transfert ${transfer.reference} annulé : ${dto.reason}`,
            branchId: from.id,
            payload: { transferId: transfer.id, quantity: item.quantity },
            performedById: user?.id ?? null,
          }, m);
        }
        if (transfer.missionId) {
          const mission = await m.findOne(FleetMission, { where: { id: transfer.missionId } });
          if (mission) await this.fleet.cancelMissionInternal(m, mission, dto.reason);
        }
      }
      await m.update(InternalTransfer, { id: transfer.id }, {
        status: InternalTransferStatus.CANCELLED,
        cancelledAt: new Date(),
        notes: [transfer.notes, `Annulé : ${dto.reason}`].filter(Boolean).join('\n'),
      });
    });

    return { message: this.t('transfer.cancelled', lang, { reference: transfer.reference }), data: await this.load(transfer.id) };
  }

  // ============================================================
  // CONSULTATION
  // ============================================================

  async list(query: TransferQueryDto, user: UserEntity, lang: string) {
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const qb = this.dataSource.manager
      .createQueryBuilder(InternalTransfer, 'tr')
      .leftJoinAndSelect('tr.fromBranch', 'fromBranch')
      .leftJoinAndSelect('tr.toBranch', 'toBranch')
      .leftJoinAndSelect('tr.vehicle', 'vehicle')
      .leftJoin('tr.driver', 'driver')
      .addSelect(['driver.id', 'driver.fullName', 'driver.phone'])
      .loadRelationCountAndMap('tr.itemsCount', 'tr.items');

    if (query.branchId) {
      await this.branchStock.assertBranchAccess(user, query.branchId, lang);
      qb.where('(tr.fromBranchId = :b OR tr.toBranchId = :b)', { b: query.branchId });
    } else {
      const companyId = await resolveCompanyId(this.dataSource, user, query.companyId, {
        required: this.t('fleet.company_required', lang),
        forbidden: this.t('transfer.forbidden', lang),
      });
      qb.where('tr.companyId = :companyId', { companyId });
    }
    if (query.fromBranchId) qb.andWhere('tr.fromBranchId = :fromB', { fromB: query.fromBranchId });
    if (query.toBranchId) qb.andWhere('tr.toBranchId = :toB', { toB: query.toBranchId });
    if (query.status) qb.andWhere('tr.status = :status', { status: query.status });
    if (query.from) qb.andWhere('tr.createdAt >= :dFrom', { dFrom: new Date(`${query.from}T00:00:00`) });
    if (query.to) qb.andWhere('tr.createdAt <= :dTo', { dTo: new Date(`${query.to}T23:59:59.999`) });
    if (query.search?.trim()) {
      const kw = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('LOWER(tr.reference) LIKE :kw', { kw })
            .orWhere(
              'EXISTS (SELECT 1 FROM bo_logistics_transfer_items ti WHERE ti.transferId = tr.id AND LOWER(ti.trackingNumber) LIKE :kw)',
              { kw },
            ),
        ),
      );
    }
    const [items, total] = await qb.orderBy('tr.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
    return { message: this.t('transfer.list', lang), data: new PaginatedResponseDto(items, total, page, limit) };
  }

  async findOne(id: string, user: UserEntity, lang: string) {
    const transfer = await this.getTransfer(id, user, lang);
    const movements = await this.dataSource.query(
      'SELECT * FROM `branch_parcel_movements` WHERE `transferId` = ? ORDER BY `createdAt` ASC',
      [transfer.id],
    );
    return { message: this.t('transfer.detail', lang), data: { ...transfer, movements } };
  }

  /** Transferts en cours vers une branche (colis attendus) */
  async incoming(branchId: string, user: UserEntity, lang: string) {
    await this.branchStock.assertBranchAccess(user, branchId, lang);
    const items = await this.dataSource.manager.find(InternalTransfer, {
      where: { toBranchId: branchId, status: InternalTransferStatus.IN_TRANSIT },
      relations: ['items', 'fromBranch', 'vehicle', 'driver'],
      order: { dispatchedAt: 'ASC' },
    });
    return { message: this.t('transfer.incoming', lang), data: items };
  }
}
