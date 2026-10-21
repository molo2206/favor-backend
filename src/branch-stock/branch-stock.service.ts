import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, MoreThan } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { ShipmentTracking } from 'src/shipment/entity/shipment_tracking.entity';
import { ShipmentStatus } from 'src/shipment/enum/shipment.dto';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { LtaShipmentEntity } from 'src/shipment/Lta/entity/lta-shipment.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { SupplyHistoryService } from 'src/supply/supply-history.service';
import { SupplyEventType, SupplyStatus } from 'src/supply/enums/supply.enum';
import { BranchParcelStock } from './entities/branch-parcel-stock.entity';
import { BranchParcelMovement } from './entities/branch-parcel-movement.entity';
import { BranchMovementType, BranchStockStatus, MOVEMENTS_IN } from './enums/branch-stock.enum';
import {
  AdjustStockDto,
  DecreaseStockDto,
  MovementQueryDto,
  ReceiveLtaDto,
  ReceiveParcelDto,
  StockQueryDto,
  WithdrawParcelDto,
} from './dto/branch-stock.dto';

export interface MovementOptions {
  reason?: string | null;
  note?: string | null;
  reference?: string | null;
  transferId?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  performedById?: string | null;
}

/**
 * Stock des colis par branche : réception, pointage (mouvements), retraits,
 * diminutions manuelles, inventaire et transferts.
 */
@Injectable()
export class BranchStockService {
  private readonly logger = new Logger(BranchStockService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly supplyHistory: SupplyHistoryService,
  ) { }

  private t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params);
  }

  // ============================================================
  // DROITS
  // ============================================================

  /** Admin / super admin, ou utilisateur rattaché à l'entreprise de la branche */
  async assertBranchAccess(user: UserEntity, branchId: string, lang: string, manager?: EntityManager): Promise<BranchEntity> {
    const m = manager ?? this.dataSource.manager;
    const branch = await m.findOne(BranchEntity, { where: { id: branchId } });
    if (!branch || branch.deleted) {
      throw new NotFoundException(this.t('branch_stock.branch_not_found', lang));
    }
    if (!user) throw new ForbiddenException(this.t('branch_stock.forbidden', lang));
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) return branch;
    if (branch.company_id) {
      const rows = await m.query(
        'SELECT 1 FROM `user_has_company` WHERE `userId` = ? AND `companyId` = ? LIMIT 1',
        [user.id, branch.company_id],
      );
      if (Array.isArray(rows) && rows.length) return branch;
    }
    throw new ForbiddenException(this.t('branch_stock.forbidden', lang));
  }

  // ============================================================
  // OUTILS
  // ============================================================

  private statusFor(stock: Pick<BranchParcelStock, 'quantityIn' | 'quantityOut' | 'quantityAvailable'>): BranchStockStatus {
    if (stock.quantityAvailable <= 0) return BranchStockStatus.OUT;
    if (stock.quantityOut > 0) return BranchStockStatus.PARTIAL;
    return BranchStockStatus.IN_STOCK;
  }

  private async findShipment(
    m: EntityManager,
    lang: string,
    shipmentId?: string,
    trackingNumber?: string,
  ): Promise<Shipment> {
    if (!shipmentId && !trackingNumber) {
      throw new BadRequestException(this.t('branch_stock.shipment_required', lang));
    }
    const shipment = await m.findOne(Shipment, {
      where: shipmentId ? { id: shipmentId } : { trackingNumber: String(trackingNumber).trim() },
      relations: ['package', 'user'],
    });
    if (!shipment) throw new NotFoundException(this.t('branch_stock.shipment_not_found', lang));
    return shipment;
  }

  private expectedPieces(shipment: Shipment): number {
    const q = Number(shipment.package?.external_quantity ?? 0);
    return Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
  }

  /**
   * ✅ Cœur du pointage : applique un mouvement (verrou sur la ligne de stock)
   * et l'enregistre. Lève une erreur si la sortie dépasse le stock restant.
   */
  async applyMovement(
    m: EntityManager,
    stockId: string,
    type: BranchMovementType,
    quantity: number,
    options: MovementOptions,
    lang: string,
  ): Promise<{ stock: BranchParcelStock; movement: BranchParcelMovement }> {
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new BadRequestException(this.t('branch_stock.invalid_quantity', lang));
    }

    const stock = await m.findOne(BranchParcelStock, {
      where: { id: stockId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!stock) throw new NotFoundException(this.t('branch_stock.stock_not_found', lang));

    const before = stock.quantityAvailable;
    const isIn = MOVEMENTS_IN.includes(type);
    if (!isIn && qty > before) {
      throw new BadRequestException(
        this.t('branch_stock.insufficient_stock', lang, { available: before, requested: qty, tracking: stock.trackingNumber }),
      );
    }

    if (isIn) {
      stock.quantityIn += qty;
      stock.quantityAvailable += qty;
      if (!stock.firstReceivedAt) stock.firstReceivedAt = new Date();
    } else {
      stock.quantityOut += qty;
      stock.quantityAvailable -= qty;
    }
    stock.status = this.statusFor(stock);
    stock.lastMovementAt = new Date();
    await m.save(BranchParcelStock, stock);

    const movement = await m.save(
      BranchParcelMovement,
      m.create(BranchParcelMovement, {
        stockId: stock.id,
        branchId: stock.branchId,
        shipmentId: stock.shipmentId,
        type,
        quantity: qty,
        quantityBefore: before,
        quantityAfter: stock.quantityAvailable,
        reason: options.reason ?? null,
        note: options.note ?? null,
        reference: options.reference ?? null,
        transferId: options.transferId ?? null,
        recipientName: options.recipientName ?? null,
        recipientPhone: options.recipientPhone ?? null,
        performedById: options.performedById ?? null,
      }),
    );
    return { stock, movement };
  }

  /** Ligne de stock (créée si besoin) pour un shipment dans une branche */
  async getOrCreateStock(
    m: EntityManager,
    branch: BranchEntity,
    shipment: Shipment,
    extra: { ltaId?: string | null; location?: string | null; receivedById?: string | null } = {},
  ): Promise<BranchParcelStock> {
    let stock = await m.findOne(BranchParcelStock, { where: { branchId: branch.id, shipmentId: shipment.id } });
    if (stock) {
      let changed = false;
      if (extra.ltaId && !stock.ltaId) { stock.ltaId = extra.ltaId; changed = true; }
      if (extra.location) { stock.location = extra.location; changed = true; }
      if (changed) stock = await m.save(BranchParcelStock, stock);
      return stock;
    }
    return m.save(
      BranchParcelStock,
      m.create(BranchParcelStock, {
        branchId: branch.id,
        companyId: branch.company_id ?? null,
        shipmentId: shipment.id,
        ltaId: extra.ltaId ?? null,
        trackingNumber: shipment.trackingNumber,
        description: shipment.package?.description ? String(shipment.package.description).slice(0, 255) : null,
        clientName: shipment.clientName || shipment.user?.fullName || shipment.deliveryContactName || null,
        clientPhone: shipment.clientPhone || shipment.user?.phone || shipment.deliveryContactPhone || null,
        quantityIn: 0,
        quantityOut: 0,
        quantityAvailable: 0,
        status: BranchStockStatus.IN_STOCK,
        location: extra.location ?? null,
        receivedById: extra.receivedById ?? null,
      }),
    );
  }

  /** Ligne de tracking sur le shipment (« Reçu à la branche X », « Retiré à… ») */
  private async addShipmentTracking(
    m: EntityManager,
    shipment: Shipment,
    status: ShipmentStatus,
    location: string,
    comment: string,
  ): Promise<void> {
    await m.save(
      ShipmentTracking,
      m.create(ShipmentTracking, {
        shipmentId: shipment.id,
        shipment: { id: shipment.id } as Shipment,
        status,
        location,
        comment,
      }),
    );
  }

  // ============================================================
  // RÉCEPTION (approvisionnement d'une branche)
  // ============================================================

  async receive(dto: ReceiveParcelDto, user: UserEntity, lang: string) {
    const branch = await this.assertBranchAccess(user, dto.branchId, lang);

    const result = await this.dataSource.transaction(async (m) => {
      const shipment = await this.findShipment(m, lang, dto.shipmentId, dto.trackingNumber);
      return this.receiveInTransaction(m, branch, shipment, dto, user, lang);
    });

    return { message: this.t('branch_stock.received', lang, { tracking: result.stock.trackingNumber, quantity: result.movement.quantity }), data: result };
  }

  /** Réception d'un shipment (utilisée aussi par la réception d'une LTA) */
  private async receiveInTransaction(
    m: EntityManager,
    branch: BranchEntity,
    shipment: Shipment,
    dto: Omit<ReceiveParcelDto, 'branchId'>,
    user: UserEntity,
    lang: string,
  ) {
    const expected = this.expectedPieces(shipment);

    // Pièces déjà reçues dans TOUTES les branches (réceptions directes uniquement)
    const receivedRow = await m
      .createQueryBuilder(BranchParcelMovement, 'mv')
      .select('COALESCE(SUM(mv.quantity), 0)', 'total')
      .where('mv.shipmentId = :sid', { sid: shipment.id })
      .andWhere('mv.type = :type', { type: BranchMovementType.IN_RECEPTION })
      .getRawOne<{ total: string }>();
    const alreadyReceived = Number(receivedRow?.total ?? 0);

    const quantity = dto.quantity ?? Math.max(expected - alreadyReceived, 0);
    if (quantity <= 0) {
      throw new BadRequestException(this.t('branch_stock.already_received', lang, { tracking: shipment.trackingNumber }));
    }
    if (!dto.allowExcess && alreadyReceived + quantity > expected) {
      throw new BadRequestException(
        this.t('branch_stock.exceeds_expected', lang, {
          tracking: shipment.trackingNumber,
          expected,
          received: alreadyReceived,
          quantity,
        }),
      );
    }

    // LTA : celle envoyée, sinon la dernière LTA du shipment
    let ltaId = dto.ltaId ?? null;
    if (!ltaId) {
      const link = await m.findOne(LtaShipmentEntity, { where: { shipmentId: shipment.id }, order: { createdAt: 'DESC' } });
      ltaId = link?.ltaId ?? null;
    }

    const stock = await this.getOrCreateStock(m, branch, shipment, {
      ltaId,
      location: dto.location ?? null,
      receivedById: user?.id ?? null,
    });

    const { stock: updated, movement } = await this.applyMovement(
      m,
      stock.id,
      BranchMovementType.IN_RECEPTION,
      quantity,
      { note: dto.note ?? null, reference: ltaId ? `LTA:${ltaId}` : null, performedById: user?.id ?? null },
      lang,
    );

    // Shipment : nouveau statut éventuel + ligne de tracking
    const location = `${branch.name}${branch.address ? ` — ${branch.address}` : ''}`;
    if (dto.shipmentStatus && dto.shipmentStatus !== shipment.status) {
      shipment.status = dto.shipmentStatus;
      await m.save(Shipment, shipment); // l'historique Supply suit automatiquement
    }
    await this.addShipmentTracking(
      m,
      shipment,
      shipment.status,
      location,
      `Reçu à la branche ${branch.name} : ${quantity} pièce(s)${dto.note ? ` — ${dto.note}` : ''}`,
    );

    // Historique Supply
    await this.supplyHistory.recordForShipment(
      shipment.id,
      {
        eventType: SupplyEventType.RECEIVED_AT_BRANCH,
        description: `Réception à la branche ${branch.name} : ${quantity} pièce(s) (stock : ${updated.quantityAvailable})`,
        branchId: branch.id,
        ltaId,
        location,
        performedById: user?.id ?? null,
        payload: { stockId: updated.id, movementId: movement.id, quantity, available: updated.quantityAvailable },
      },
      m,
      SupplyStatus.RECEIVED_AT_BRANCH,
    );

    return { stock: updated, movement, expected, alreadyReceived: alreadyReceived + quantity };
  }

  /** Réception de tous les colis d'une LTA */
  async receiveLta(dto: ReceiveLtaDto, user: UserEntity, lang: string) {
    const branch = await this.assertBranchAccess(user, dto.branchId, lang);
    const lta = await this.dataSource.manager.findOne(LtaEntity, { where: { id: dto.ltaId } });
    if (!lta) throw new NotFoundException(this.t('branch_stock.lta_not_found', lang));

    const links = await this.dataSource.manager.find(LtaShipmentEntity, { where: { ltaId: lta.id } });
    const received: any[] = [];
    const skipped: { trackingNumber: string; reason: string }[] = [];

    for (const link of links) {
      try {
        const res = await this.dataSource.transaction(async (m) => {
          const shipment = await this.findShipment(m, lang, link.shipmentId);
          return this.receiveInTransaction(
            m,
            branch,
            shipment,
            { shipmentId: shipment.id, ltaId: lta.id, shipmentStatus: dto.shipmentStatus, note: dto.note ?? `Réception LTA ${lta.ltaNumber}` },
            user,
            lang,
          );
        });
        received.push({ trackingNumber: res.stock.trackingNumber, quantity: res.movement.quantity, available: res.stock.quantityAvailable });
      } catch (error: any) {
        const shipment = await this.dataSource.manager.findOne(Shipment, { where: { id: link.shipmentId } });
        skipped.push({ trackingNumber: shipment?.trackingNumber ?? link.shipmentId, reason: error?.response?.message || error?.message });
      }
    }

    return {
      message: this.t('branch_stock.lta_received', lang, { lta: lta.ltaNumber, count: received.length, skipped: skipped.length }),
      data: { ltaId: lta.id, ltaNumber: lta.ltaNumber, branchId: branch.id, received, skipped },
    };
  }

  // ============================================================
  // RETRAIT PAR LE CLIENT
  // ============================================================

  private async resolveStockForOut(
    m: EntityManager,
    dto: WithdrawParcelDto,
    lang: string,
  ): Promise<BranchParcelStock> {
    if (dto.stockId) {
      const stock = await m.findOne(BranchParcelStock, { where: { id: dto.stockId } });
      if (!stock) throw new NotFoundException(this.t('branch_stock.stock_not_found', lang));
      return stock;
    }
    const shipment = await this.findShipment(m, lang, dto.shipmentId, dto.trackingNumber);
    const where: any = { shipmentId: shipment.id, quantityAvailable: MoreThan(0) };
    if (dto.branchId) where.branchId = dto.branchId;
    const stocks = await m.find(BranchParcelStock, { where, order: { lastMovementAt: 'DESC' } });
    if (!stocks.length) throw new NotFoundException(this.t('branch_stock.not_in_stock', lang, { tracking: shipment.trackingNumber }));
    if (stocks.length > 1 && !dto.branchId) {
      throw new BadRequestException(this.t('branch_stock.branch_required_multiple', lang, { tracking: shipment.trackingNumber }));
    }
    return stocks[0];
  }

  async withdraw(dto: WithdrawParcelDto, user: UserEntity, lang: string) {
    const stockRef = await this.resolveStockForOut(this.dataSource.manager, dto, lang);
    const branch = await this.assertBranchAccess(user, stockRef.branchId, lang);

    const result = await this.dataSource.transaction(async (m) =>
      this.withdrawInTransaction(m, branch, stockRef.id, dto.quantity ?? null, {
        recipientName: dto.recipientName ?? null,
        recipientPhone: dto.recipientPhone ?? null,
        note: dto.note ?? null,
        performedById: user?.id ?? null,
      }, user, lang, true),
    );

    return {
      message: this.t('branch_stock.withdrawn', lang, { tracking: result.stock.trackingNumber, quantity: result.movement.quantity, available: result.stock.quantityAvailable }),
      data: result,
    };
  }

  private async withdrawInTransaction(
    m: EntityManager,
    branch: BranchEntity,
    stockId: string,
    quantity: number | null,
    options: MovementOptions,
    user: UserEntity | null,
    lang: string,
    markCollected: boolean,
  ) {
    const current = await m.findOne(BranchParcelStock, { where: { id: stockId } });
    if (!current) throw new NotFoundException(this.t('branch_stock.stock_not_found', lang));
    const qty = quantity ?? current.quantityAvailable;
    if (qty <= 0) throw new BadRequestException(this.t('branch_stock.not_in_stock', lang, { tracking: current.trackingNumber }));

    const { stock, movement } = await this.applyMovement(m, stockId, BranchMovementType.OUT_PICKUP, qty, options, lang);

    const shipment = await m.findOne(Shipment, { where: { id: stock.shipmentId } });
    const location = `${branch.name}${branch.address ? ` — ${branch.address}` : ''}`;

    // Plus rien nulle part → colis entièrement retiré
    const remainingRow = await m
      .createQueryBuilder(BranchParcelStock, 's')
      .select('COALESCE(SUM(s.quantityAvailable), 0)', 'total')
      .where('s.shipmentId = :sid', { sid: stock.shipmentId })
      .getRawOne<{ total: string }>();
    const remainingEverywhere = Number(remainingRow?.total ?? 0);

    if (shipment) {
      if (markCollected && remainingEverywhere === 0 && shipment.status !== ShipmentStatus.COLLECTED) {
        shipment.status = ShipmentStatus.COLLECTED;
        shipment.collectedAt = new Date();
        if (user?.id) shipment.userAssignId = user.id;
        await m.save(Shipment, shipment);
      }
      await this.addShipmentTracking(
        m,
        shipment,
        shipment.status,
        location,
        `Retrait à la branche ${branch.name} : ${movement.quantity} pièce(s)${options.recipientName ? ` par ${options.recipientName}` : ''} (reste : ${stock.quantityAvailable})`,
      );
    }

    await this.supplyHistory.recordForShipment(
      stock.shipmentId,
      {
        eventType: remainingEverywhere === 0 ? SupplyEventType.PICKED_UP : SupplyEventType.STOCK_MOVEMENT,
        description: `Retrait client à ${branch.name} : ${movement.quantity} pièce(s)${options.recipientName ? ` (${options.recipientName})` : ''}, reste ${stock.quantityAvailable}`,
        branchId: branch.id,
        location,
        performedById: options.performedById ?? null,
        payload: { stockId: stock.id, movementId: movement.id, quantity: movement.quantity, available: stock.quantityAvailable },
      },
      m,
      remainingEverywhere === 0 ? SupplyStatus.COMPLETED : null,
    );

    return { stock, movement, remainingEverywhere };
  }

  /**
   * ✅ Appelé après le retrait par code PIN (shipment COLLECTED) :
   * sort automatiquement le stock restant de la branche.
   * Ne lève jamais d'erreur (le retrait PIN ne doit pas échouer à cause du stock).
   */
  async autoWithdrawForShipment(shipmentId: string, user: UserEntity | null, preferredBranchId?: string | null): Promise<void> {
    try {
      const stocks = await this.dataSource.manager.find(BranchParcelStock, {
        where: { shipmentId, quantityAvailable: MoreThan(0) },
        order: { lastMovementAt: 'DESC' },
      });
      if (!stocks.length) return; // jamais réceptionné en branche : rien à sortir
      const stock = stocks.find((s) => s.branchId === preferredBranchId) ?? stocks[0];
      const branch = await this.dataSource.manager.findOne(BranchEntity, { where: { id: stock.branchId } });
      if (!branch) return;

      await this.dataSource.transaction((m) =>
        this.withdrawInTransaction(m, branch, stock.id, null, {
          reason: 'Retrait par code PIN',
          reference: 'PIN',
          performedById: user?.id ?? null,
        }, user, 'fr', false),
      );
    } catch (error: any) {
      this.logger.error(`Sortie de stock automatique (shipment ${shipmentId}) : ${error?.message}`);
    }
  }

  // ============================================================
  // DIMINUTION MANUELLE / INVENTAIRE / EMPLACEMENT
  // ============================================================

  async decrease(stockId: string, dto: DecreaseStockDto, user: UserEntity, lang: string) {
    const ref = await this.dataSource.manager.findOne(BranchParcelStock, { where: { id: stockId } });
    if (!ref) throw new NotFoundException(this.t('branch_stock.stock_not_found', lang));
    const branch = await this.assertBranchAccess(user, ref.branchId, lang);

    const result = await this.dataSource.transaction(async (m) => {
      const res = await this.applyMovement(m, stockId, BranchMovementType.OUT_MANUAL, dto.quantity, {
        reason: dto.reason,
        note: dto.note ?? null,
        performedById: user?.id ?? null,
      }, lang);
      await this.supplyHistory.recordForShipment(res.stock.shipmentId, {
        eventType: SupplyEventType.STOCK_MOVEMENT,
        description: `Diminution manuelle à ${branch.name} : -${dto.quantity} (${dto.reason}), reste ${res.stock.quantityAvailable}`,
        branchId: branch.id,
        performedById: user?.id ?? null,
        payload: { stockId, movementId: res.movement.id, quantity: dto.quantity, reason: dto.reason },
      }, m);
      return res;
    });

    return { message: this.t('branch_stock.decreased', lang, { quantity: dto.quantity, available: result.stock.quantityAvailable }), data: result };
  }

  async adjust(stockId: string, dto: AdjustStockDto, user: UserEntity, lang: string) {
    const ref = await this.dataSource.manager.findOne(BranchParcelStock, { where: { id: stockId } });
    if (!ref) throw new NotFoundException(this.t('branch_stock.stock_not_found', lang));
    const branch = await this.assertBranchAccess(user, ref.branchId, lang);

    const diff = dto.countedQuantity - ref.quantityAvailable;
    if (diff === 0) {
      return { message: this.t('branch_stock.adjust_no_change', lang), data: { stock: ref, movement: null } };
    }

    const result = await this.dataSource.transaction(async (m) => {
      const res = await this.applyMovement(
        m,
        stockId,
        diff > 0 ? BranchMovementType.IN_ADJUSTMENT : BranchMovementType.OUT_ADJUSTMENT,
        Math.abs(diff),
        { reason: dto.reason, note: dto.note ?? null, reference: 'INVENTAIRE', performedById: user?.id ?? null },
        lang,
      );
      await this.supplyHistory.recordForShipment(res.stock.shipmentId, {
        eventType: SupplyEventType.STOCK_MOVEMENT,
        description: `Inventaire à ${branch.name} : ${ref.quantityAvailable} → ${dto.countedQuantity} (${dto.reason})`,
        branchId: branch.id,
        performedById: user?.id ?? null,
        payload: { stockId, movementId: res.movement.id, before: ref.quantityAvailable, counted: dto.countedQuantity },
      }, m);
      return res;
    });

    return { message: this.t('branch_stock.adjusted', lang, { available: result.stock.quantityAvailable }), data: result };
  }

  async setLocation(stockId: string, location: string, user: UserEntity, lang: string) {
    const stock = await this.dataSource.manager.findOne(BranchParcelStock, { where: { id: stockId } });
    if (!stock) throw new NotFoundException(this.t('branch_stock.stock_not_found', lang));
    await this.assertBranchAccess(user, stock.branchId, lang);
    stock.location = location?.trim() || null;
    await this.dataSource.manager.save(BranchParcelStock, stock);
    return { message: this.t('branch_stock.location_updated', lang), data: stock };
  }

  // ============================================================
  // CONSULTATION
  // ============================================================

  async listByBranch(branchId: string, query: StockQueryDto, user: UserEntity, lang: string) {
    await this.assertBranchAccess(user, branchId, lang);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 20));

    const qb = this.dataSource.manager
      .createQueryBuilder(BranchParcelStock, 's')
      .leftJoinAndSelect('s.shipment', 'shipment')
      .leftJoinAndSelect('shipment.package', 'package')
      .leftJoinAndSelect('s.lta', 'lta')
      .where('s.branchId = :branchId', { branchId });

    if (query.status) qb.andWhere('s.status = :status', { status: query.status });
    if (query.available === 'true' || query.available === '1') qb.andWhere('s.quantityAvailable > 0');
    if (query.search?.trim()) {
      const kw = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('LOWER(s.trackingNumber) LIKE :kw', { kw })
            .orWhere('LOWER(s.clientName) LIKE :kw', { kw })
            .orWhere('LOWER(s.clientPhone) LIKE :kw', { kw })
            .orWhere('LOWER(s.description) LIKE :kw', { kw })
            .orWhere('LOWER(s.location) LIKE :kw', { kw })
            .orWhere('LOWER(lta.ltaNumber) LIKE :kw', { kw }),
        ),
      );
    }

    const [items, total] = await qb
      .orderBy('s.lastMovementAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { message: this.t('branch_stock.list', lang), data: new PaginatedResponseDto(items, total, page, limit) };
  }

  /** Tableau de bord d'une branche : entrées, sorties, stock restant */
  async summary(branchId: string, user: UserEntity, lang: string, from?: string, to?: string) {
    const branch = await this.assertBranchAccess(user, branchId, lang);
    const m = this.dataSource.manager;

    const stockRow = await m
      .createQueryBuilder(BranchParcelStock, 's')
      .select('COUNT(*)', 'parcels')
      .addSelect('COALESCE(SUM(s.quantityIn), 0)', 'totalIn')
      .addSelect('COALESCE(SUM(s.quantityOut), 0)', 'totalOut')
      .addSelect('COALESCE(SUM(s.quantityAvailable), 0)', 'available')
      .addSelect(`SUM(CASE WHEN s.quantityAvailable > 0 THEN 1 ELSE 0 END)`, 'parcelsInStock')
      .addSelect(`SUM(CASE WHEN s.status = '${BranchStockStatus.PARTIAL}' THEN 1 ELSE 0 END)`, 'parcelsPartial')
      .where('s.branchId = :branchId', { branchId })
      .getRawOne();

    const mvQb = m
      .createQueryBuilder(BranchParcelMovement, 'mv')
      .select('mv.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(mv.quantity), 0)', 'quantity')
      .where('mv.branchId = :branchId', { branchId });
    const start = from ? new Date(`${from}T00:00:00`) : new Date(new Date().toDateString());
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
    mvQb.andWhere('mv.createdAt BETWEEN :start AND :end', { start, end });
    const byType = await mvQb.groupBy('mv.type').getRawMany();

    const periodIn = byType.filter((r) => MOVEMENTS_IN.includes(r.type)).reduce((s, r) => s + Number(r.quantity), 0);
    const periodOut = byType.filter((r) => !MOVEMENTS_IN.includes(r.type)).reduce((s, r) => s + Number(r.quantity), 0);

    return {
      message: this.t('branch_stock.summary', lang),
      data: {
        branch: { id: branch.id, name: branch.name },
        stock: {
          parcels: Number(stockRow?.parcels ?? 0),
          parcelsInStock: Number(stockRow?.parcelsInStock ?? 0),
          parcelsPartial: Number(stockRow?.parcelsPartial ?? 0),
          totalIn: Number(stockRow?.totalIn ?? 0),
          totalOut: Number(stockRow?.totalOut ?? 0),
          available: Number(stockRow?.available ?? 0),
        },
        period: {
          from: start,
          to: end,
          in: periodIn,
          out: periodOut,
          byType: byType.map((r) => ({ type: r.type, count: Number(r.count), quantity: Number(r.quantity) })),
        },
      },
    };
  }

  /** Journal de pointage (mouvements) */
  async movements(query: MovementQueryDto, user: UserEntity, lang: string) {
    if (query.branchId) await this.assertBranchAccess(user, query.branchId, lang);
    else if (!(user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN) && !query.shipmentId && !query.stockId) {
      throw new BadRequestException(this.t('branch_stock.branch_required', lang));
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 20));
    const qb = this.dataSource.manager
      .createQueryBuilder(BranchParcelMovement, 'mv')
      .leftJoinAndSelect('mv.stock', 'stock')
      .leftJoinAndSelect('mv.branch', 'branch')
      .leftJoin('mv.performedBy', 'performedBy')
      .addSelect(['performedBy.id', 'performedBy.fullName']);

    if (query.branchId) qb.andWhere('mv.branchId = :branchId', { branchId: query.branchId });
    if (query.shipmentId) qb.andWhere('mv.shipmentId = :shipmentId', { shipmentId: query.shipmentId });
    if (query.stockId) qb.andWhere('mv.stockId = :stockId', { stockId: query.stockId });
    if (query.type) qb.andWhere('mv.type = :type', { type: query.type });
    if (query.direction === 'IN') qb.andWhere('mv.type IN (:...ins)', { ins: MOVEMENTS_IN });
    if (query.direction === 'OUT') qb.andWhere('mv.type NOT IN (:...ins)', { ins: MOVEMENTS_IN });
    if (query.from) qb.andWhere('mv.createdAt >= :from', { from: new Date(`${query.from}T00:00:00`) });
    if (query.to) qb.andWhere('mv.createdAt <= :to', { to: new Date(`${query.to}T23:59:59.999`) });

    const [items, total] = await qb
      .orderBy('mv.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { message: this.t('branch_stock.movements', lang), data: new PaginatedResponseDto(items, total, page, limit) };
  }

  /** Où se trouve un shipment : stock par branche + mouvements */
  async byShipment(shipmentIdOrTracking: string, lang: string) {
    const m = this.dataSource.manager;
    const shipment = await m.findOne(Shipment, {
      where: [{ id: shipmentIdOrTracking }, { trackingNumber: shipmentIdOrTracking }],
      relations: ['package'],
    });
    if (!shipment) throw new NotFoundException(this.t('branch_stock.shipment_not_found', lang));
    const stocks = await m.find(BranchParcelStock, { where: { shipmentId: shipment.id }, relations: ['branch'] });
    const movements = await m.find(BranchParcelMovement, {
      where: { shipmentId: shipment.id },
      relations: ['branch'],
      order: { createdAt: 'ASC' },
    });
    return {
      message: this.t('branch_stock.shipment_stock', lang),
      data: {
        shipment: { id: shipment.id, trackingNumber: shipment.trackingNumber, status: shipment.status, expectedPieces: this.expectedPieces(shipment) },
        stocks,
        movements,
        totalAvailable: stocks.reduce((s, x) => s + x.quantityAvailable, 0),
      },
    };
  }

  async findOne(stockId: string, user: UserEntity, lang: string) {
    const stock = await this.dataSource.manager.findOne(BranchParcelStock, {
      where: { id: stockId },
      relations: ['branch', 'shipment', 'shipment.package', 'lta'],
    });
    if (!stock) throw new NotFoundException(this.t('branch_stock.stock_not_found', lang));
    await this.assertBranchAccess(user, stock.branchId, lang);
    const movements = await this.dataSource.manager.find(BranchParcelMovement, {
      where: { stockId },
      order: { createdAt: 'DESC' },
    });
    return { message: this.t('branch_stock.detail', lang), data: { ...stock, movements } };
  }

  /** Stocks par ids (utilisé par les transferts) */
  async findStocks(ids: string[], m?: EntityManager): Promise<BranchParcelStock[]> {
    if (!ids.length) return [];
    return (m ?? this.dataSource.manager).find(BranchParcelStock, { where: { id: In(ids) } });
  }
}
