import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Brackets, DataSource, EntityManager, In, MoreThan } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { ShipmentTracking } from 'src/shipment/entity/shipment_tracking.entity';
import { ShipmentStatus } from 'src/shipment/enum/shipment.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { SupplyHistoryService } from 'src/supply/supply-history.service';
import { SupplyEventType, SupplyStatus } from 'src/supply/enums/supply.enum';
import { BranchStockService } from './branch-stock.service';
import { BranchParcelStock } from './entities/branch-parcel-stock.entity';
import { ParcelTransfer } from './entities/parcel-transfer.entity';
import { ParcelTransferItem } from './entities/parcel-transfer-item.entity';
import { ParcelCheckin } from './entities/parcel-checkin.entity';
import { ParcelCheckinItem } from './entities/parcel-checkin-item.entity';
import { BranchMovementType } from './enums/branch-stock.enum';
import {
  CheckinItemStatus,
  CheckinStatus,
  CheckinType,
  TRANSFER_RECEIVABLE,
  TransferItemStatus,
  TransferStatus,
} from './enums/parcel-checkin.enum';
import {
  CancelCheckinDto,
  CancelTransferDto,
  CheckinQueryDto,
  CloseCheckinDto,
  CreateTransferDto,
  OpenTransferCheckinDto,
  ReturnMissingDto,
  ScanParcelDto,
  TransferItemInputDto,
  TransferQueryDto,
  UpdateCheckinItemDto,
} from './dto/parcel-transfer.dto';

/** Résultat d'un scan, renvoyé au front (son / couleur selon le cas) */
export type ScanOutcome = 'CHECKED' | 'PARTIAL' | 'ALREADY_CHECKED' | 'UNEXPECTED' | 'UNKNOWN';

/**
 * ✅ Transferts de colis entre branches + pointage à l'arrivée.
 *
 *  1. Branche A : POST /branch-stock/transfers → les colis SORTENT du stock de A (OUT_TRANSFER), « en transit ».
 *  2. Branche B : voit le transfert à recevoir (GET /branch-stock/transfers?branchId=B&direction=IN&status=IN_TRANSIT).
 *  3. Branche B : ouvre le pointage (POST /branch-stock/checkins/transfer) → liste des colis attendus.
 *  4. Branche B : scanne chaque colis (POST /branch-stock/checkins/:id/scan). Aucun effet sur le stock pendant les scans.
 *  5. Branche B : clôture (POST /branch-stock/checkins/:id/close) → les colis pointés ENTRENT dans le stock de B
 *     (IN_TRANSFER) ; les autres sont « manquants ».
 *  6. Manquants : nouveau pointage plus tard (arrivée en retard), ou branche A les remet dans son stock
 *     (POST /branch-stock/transfers/:id/return-missing).
 * Le colis peut ensuite être retiré par le client à la branche B (retrait / PIN existants).
 */
@Injectable()
export class ParcelTransferService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly stock: BranchStockService,
    private readonly supplyHistory: SupplyHistoryService,
  ) { }

  private t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params);
  }

  // ============================================================
  // OUTILS
  // ============================================================

  private isAdmin(user?: UserEntity | null): boolean {
    return user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
  }

  /** Accès à au moins une des branches (départ ou arrivée d'un transfert) */
  private async assertAnyBranchAccess(user: UserEntity, branchIds: string[], lang: string): Promise<void> {
    let lastError: any = null;
    for (const id of branchIds.filter(Boolean)) {
      try {
        await this.stock.assertBranchAccess(user, id, lang);
        return;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError ?? new NotFoundException(this.t('branch_stock.branch_not_found', lang));
  }

  private location(branch: BranchEntity): string {
    return `${branch.name}${branch.address ? ` — ${branch.address}` : ''}`;
  }

  /** Référence lisible : PREFIXE-AAMMJJ-XXXXX (unique) */
  private async newCode(m: EntityManager, prefix: 'TR' | 'PT', entity: typeof ParcelTransfer | typeof ParcelCheckin): Promise<string> {
    const d = new Date();
    const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    for (let i = 0; i < 10; i++) {
      const code = `${prefix}-${ymd}-${randomBytes(4).toString('hex').slice(0, 5).toUpperCase()}`;
      const exists = await m.count(entity as any, { where: { code } });
      if (!exists) return code;
    }
    return `${prefix}-${ymd}-${Date.now().toString(36).toUpperCase()}`;
  }

  private expectedPieces(shipment: Shipment): number {
    const q = Number(shipment.package?.external_quantity ?? 0);
    return Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
  }

  /** Pièces envoyées pas encore reçues ni remises au départ */
  private remaining(ti: Pick<ParcelTransferItem, 'quantity' | 'receivedQty' | 'returnedQty'>): number {
    return Math.max(0, ti.quantity - ti.receivedQty - ti.returnedQty);
  }

  /** État d'une ligne de transfert après une réception / un retour */
  private transferItemStatus(ti: ParcelTransferItem): TransferItemStatus {
    const rest = this.remaining(ti);
    if (rest <= 0) {
      if (ti.returnedQty <= 0) return TransferItemStatus.RECEIVED;
      if (ti.receivedQty <= 0) return TransferItemStatus.RETURNED;
      return TransferItemStatus.PARTIAL;
    }
    return ti.receivedQty > 0 ? TransferItemStatus.PARTIAL : TransferItemStatus.MISSING;
  }

  private async addTracking(m: EntityManager, shipment: Shipment, location: string, comment: string): Promise<void> {
    await m.save(
      ShipmentTracking,
      m.create(ShipmentTracking, {
        shipmentId: shipment.id,
        shipment: { id: shipment.id } as Shipment,
        status: shipment.status,
        location,
        comment,
      }),
    );
  }

  /** Ligne de stock de la branche de départ pour un colis à envoyer */
  private async resolveFromStock(m: EntityManager, from: BranchEntity, input: TransferItemInputDto, lang: string): Promise<BranchParcelStock> {
    if (input.stockId) {
      const stock = await m.findOne(BranchParcelStock, { where: { id: input.stockId } });
      if (!stock) throw new NotFoundException(this.t('branch_stock.stock_not_found', lang));
      if (stock.branchId !== from.id) {
        throw new BadRequestException(this.t('branch_stock.stock_wrong_branch', lang, { tracking: stock.trackingNumber, branch: from.name }));
      }
      return stock;
    }
    if (!input.shipmentId && !input.trackingNumber) {
      throw new BadRequestException(this.t('branch_stock.shipment_required', lang));
    }
    const shipment = await m.findOne(Shipment, {
      where: input.shipmentId ? { id: input.shipmentId } : { trackingNumber: String(input.trackingNumber).trim() },
    });
    if (!shipment) throw new NotFoundException(this.t('branch_stock.shipment_not_found', lang));
    const stock = await m.findOne(BranchParcelStock, { where: { branchId: from.id, shipmentId: shipment.id } });
    if (!stock) throw new NotFoundException(this.t('branch_stock.not_in_stock', lang, { tracking: shipment.trackingNumber }));
    return stock;
  }

  /** Compteurs d'une séance de pointage (recalculés à partir des lignes) */
  private computeCounters(checkin: ParcelCheckin, items: ParcelCheckinItem[], closing = false): void {
    const expected = items.filter((i) => i.expectedQty > 0);
    checkin.expectedParcels = expected.length;
    checkin.expectedPieces = expected.reduce((s, i) => s + i.expectedQty, 0);
    checkin.checkedParcels = expected.filter((i) => i.checkedQty > 0).length;
    checkin.checkedPieces = expected.reduce((s, i) => s + Math.min(i.checkedQty, i.expectedQty), 0);
    checkin.missingPieces = expected.reduce((s, i) => s + Math.max(0, i.expectedQty - i.checkedQty), 0);
    checkin.missingParcels = closing
      ? expected.filter((i) => i.checkedQty <= 0).length
      : expected.filter((i) => i.checkedQty < i.expectedQty).length;
    checkin.unexpectedParcels = items.filter((i) => i.status === CheckinItemStatus.UNEXPECTED).length;
    checkin.unknownCodes = items.filter((i) => i.status === CheckinItemStatus.UNKNOWN).length;
    checkin.damagedParcels = items.filter((i) => i.damaged).length;
  }

  private progress(checkin: ParcelCheckin) {
    return {
      expectedParcels: checkin.expectedParcels,
      checkedParcels: checkin.checkedParcels,
      expectedPieces: checkin.expectedPieces,
      checkedPieces: checkin.checkedPieces,
      remainingPieces: checkin.missingPieces,
      unexpectedParcels: checkin.unexpectedParcels,
      unknownCodes: checkin.unknownCodes,
      damagedParcels: checkin.damagedParcels,
    };
  }

  /** Séance de pointage verrouillée et encore ouverte (dans une transaction) */
  private async lockOpenCheckin(m: EntityManager, id: string, lang: string): Promise<ParcelCheckin> {
    const checkin = await m.findOne(ParcelCheckin, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!checkin) throw new NotFoundException(this.t('branch_stock.checkin_not_found', lang));
    if (checkin.status !== CheckinStatus.OPEN) {
      throw new BadRequestException(this.t('branch_stock.checkin_not_open', lang, { code: checkin.code, status: checkin.status }));
    }
    return checkin;
  }

  private async refreshCounters(m: EntityManager, checkin: ParcelCheckin): Promise<ParcelCheckin> {
    const items = await m.find(ParcelCheckinItem, { where: { checkinId: checkin.id } });
    this.computeCounters(checkin, items);
    return m.save(ParcelCheckin, checkin);
  }

  // ============================================================
  // CHARGEMENT (sans données sensibles des utilisateurs)
  // ============================================================

  private async loadTransfer(id: string) {
    const transfer = await this.dataSource.manager
      .createQueryBuilder(ParcelTransfer, 't')
      .leftJoin('t.fromBranch', 'fromBranch')
      .addSelect(['fromBranch.id', 'fromBranch.name', 'fromBranch.address'])
      .leftJoin('t.toBranch', 'toBranch')
      .addSelect(['toBranch.id', 'toBranch.name', 'toBranch.address'])
      .leftJoin('t.lta', 'lta')
      .addSelect(['lta.id', 'lta.ltaNumber'])
      .leftJoin('t.sentBy', 'sentBy')
      .addSelect(['sentBy.id', 'sentBy.fullName'])
      .leftJoin('t.receivedBy', 'receivedBy')
      .addSelect(['receivedBy.id', 'receivedBy.fullName'])
      .leftJoinAndSelect('t.items', 'items')
      .where('t.id = :id', { id })
      .orderBy('items.trackingNumber', 'ASC')
      .getOne();
    if (!transfer) return null;
    const checkins = await this.dataSource.manager.find(ParcelCheckin, {
      where: { transferId: id },
      order: { createdAt: 'DESC' },
    });
    return { ...transfer, checkins };
  }

  private async loadCheckin(id: string) {
    return this.dataSource.manager
      .createQueryBuilder(ParcelCheckin, 'c')
      .leftJoin('c.branch', 'branch')
      .addSelect(['branch.id', 'branch.name', 'branch.address'])
      .leftJoinAndSelect('c.transfer', 'transfer')
      .leftJoin('transfer.fromBranch', 'fromBranch')
      .addSelect(['fromBranch.id', 'fromBranch.name'])
      .leftJoin('c.openedBy', 'openedBy')
      .addSelect(['openedBy.id', 'openedBy.fullName'])
      .leftJoin('c.closedBy', 'closedBy')
      .addSelect(['closedBy.id', 'closedBy.fullName'])
      .leftJoinAndSelect('c.items', 'items')
      .where('c.id = :id', { id })
      .orderBy('items.trackingNumber', 'ASC')
      .getOne();
  }

  // ============================================================
  // 1. ENVOI (branche de départ)
  // ============================================================

  async createTransfer(dto: CreateTransferDto, user: UserEntity, lang: string) {
    if (dto.fromBranchId === dto.toBranchId) {
      throw new BadRequestException(this.t('branch_stock.transfer_same_branch', lang));
    }
    const from = await this.stock.assertBranchAccess(user, dto.fromBranchId, lang);
    const to = await this.dataSource.manager.findOne(BranchEntity, { where: { id: dto.toBranchId } });
    if (!to || to.deleted) throw new NotFoundException(this.t('branch_stock.branch_not_found', lang));

    let inputs: TransferItemInputDto[] = dto.items ?? [];
    if (!inputs.length && dto.ltaId) {
      const stocks = await this.dataSource.manager.find(BranchParcelStock, {
        where: { branchId: from.id, ltaId: dto.ltaId, quantityAvailable: MoreThan(0) },
      });
      if (!stocks.length) throw new BadRequestException(this.t('branch_stock.transfer_lta_empty', lang, { branch: from.name }));
      inputs = stocks.map((s) => ({ stockId: s.id }));
    }
    if (!inputs.length) throw new BadRequestException(this.t('branch_stock.transfer_items_required', lang));

    // Tout ou rien : si un colis ne peut pas partir, le transfert n'est pas créé
    const saved = await this.dataSource.transaction(async (m) => {
      const code = await this.newCode(m, 'TR', ParcelTransfer);
      const transfer = await m.save(
        ParcelTransfer,
        m.create(ParcelTransfer, {
          code,
          fromBranchId: from.id,
          toBranchId: to.id,
          companyId: from.company_id ?? null,
          ltaId: dto.ltaId ?? null,
          status: TransferStatus.IN_TRANSIT,
          note: dto.note ?? null,
          sentById: user?.id ?? null,
          sentAt: new Date(),
        }),
      );

      const seen = new Set<string>();
      let pieces = 0;
      const fromLocation = this.location(from);

      for (const input of inputs) {
        const stockRow = await this.resolveFromStock(m, from, input, lang);
        if (seen.has(stockRow.shipmentId)) {
          throw new BadRequestException(this.t('branch_stock.transfer_duplicate', lang, { tracking: stockRow.trackingNumber }));
        }
        seen.add(stockRow.shipmentId);

        const qty = input.quantity ?? stockRow.quantityAvailable;
        if (qty <= 0) throw new BadRequestException(this.t('branch_stock.not_in_stock', lang, { tracking: stockRow.trackingNumber }));

        // Sortie du stock de départ (refusée si stock insuffisant)
        const { stock: updated, movement } = await this.stock.applyMovement(
          m,
          stockRow.id,
          BranchMovementType.OUT_TRANSFER,
          qty,
          { reason: `Transfert vers ${to.name}`, note: dto.note ?? null, reference: code, transferId: transfer.id, performedById: user?.id ?? null },
          lang,
        );

        await m.save(
          ParcelTransferItem,
          m.create(ParcelTransferItem, {
            transferId: transfer.id,
            shipmentId: updated.shipmentId,
            fromStockId: updated.id,
            trackingNumber: updated.trackingNumber,
            description: updated.description ?? null,
            clientName: updated.clientName ?? null,
            clientPhone: updated.clientPhone ?? null,
            quantity: qty,
            receivedQty: 0,
            returnedQty: 0,
            status: TransferItemStatus.IN_TRANSIT,
            outMovementId: movement.id,
          }),
        );
        pieces += qty;

        const shipment = await m.findOne(Shipment, { where: { id: updated.shipmentId } });
        if (shipment) {
          await this.addTracking(m, shipment, fromLocation, `Envoyé de ${from.name} vers ${to.name} : ${qty} pièce(s) (transfert ${code})`);
        }
        await this.supplyHistory.recordForShipment(
          updated.shipmentId,
          {
            eventType: SupplyEventType.TRANSFER_DISPATCHED,
            description: `Transfert ${code} : ${qty} pièce(s) envoyée(s) de ${from.name} vers ${to.name}`,
            branchId: from.id,
            ltaId: updated.ltaId ?? null,
            location: fromLocation,
            performedById: user?.id ?? null,
            payload: { transferId: transfer.id, code, toBranchId: to.id, stockId: updated.id, movementId: movement.id, quantity: qty },
          },
          m,
        );
      }

      transfer.parcelsCount = seen.size;
      transfer.piecesCount = pieces;
      transfer.missingPieces = pieces;
      return m.save(ParcelTransfer, transfer);
    });

    return {
      message: this.t('branch_stock.transfer_created', lang, { code: saved.code, parcels: saved.parcelsCount, pieces: saved.piecesCount, to: to.name }),
      data: await this.loadTransfer(saved.id),
    };
  }

  async listTransfers(query: TransferQueryDto, user: UserEntity, lang: string) {
    if (query.branchId) await this.stock.assertBranchAccess(user, query.branchId, lang);
    else if (!this.isAdmin(user)) throw new BadRequestException(this.t('branch_stock.branch_required', lang));

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 20));
    const qb = this.dataSource.manager
      .createQueryBuilder(ParcelTransfer, 't')
      .leftJoin('t.fromBranch', 'fromBranch')
      .addSelect(['fromBranch.id', 'fromBranch.name'])
      .leftJoin('t.toBranch', 'toBranch')
      .addSelect(['toBranch.id', 'toBranch.name'])
      .leftJoin('t.sentBy', 'sentBy')
      .addSelect(['sentBy.id', 'sentBy.fullName']);

    if (query.branchId) {
      const direction = query.direction ?? 'ALL';
      if (direction === 'OUT') qb.andWhere('t.fromBranchId = :b', { b: query.branchId });
      else if (direction === 'IN') qb.andWhere('t.toBranchId = :b', { b: query.branchId });
      else qb.andWhere('(t.fromBranchId = :b OR t.toBranchId = :b)', { b: query.branchId });
    }
    if (query.status) qb.andWhere('t.status = :status', { status: query.status });
    if (query.search?.trim()) {
      const kw = `%${query.search.trim()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('t.code LIKE :kw', { kw })
            .orWhere('EXISTS (SELECT 1 FROM parcel_transfer_items pti WHERE pti.transferId = t.id AND pti.trackingNumber LIKE :kw)', { kw }),
        ),
      );
    }

    const [items, total] = await qb
      .orderBy('t.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { message: this.t('branch_stock.transfer_list', lang), data: new PaginatedResponseDto(items, total, page, limit) };
  }

  async getTransfer(id: string, user: UserEntity, lang: string) {
    const ref = await this.dataSource.manager.findOne(ParcelTransfer, { where: { id } });
    if (!ref) throw new NotFoundException(this.t('branch_stock.transfer_not_found', lang));
    await this.assertAnyBranchAccess(user, [ref.fromBranchId, ref.toBranchId], lang);
    return { message: this.t('branch_stock.transfer_detail', lang), data: await this.loadTransfer(id) };
  }

  /** Annulation avant toute réception : les colis reviennent dans le stock de départ */
  async cancelTransfer(id: string, dto: CancelTransferDto, user: UserEntity, lang: string) {
    const ref = await this.dataSource.manager.findOne(ParcelTransfer, { where: { id } });
    if (!ref) throw new NotFoundException(this.t('branch_stock.transfer_not_found', lang));
    const from = await this.stock.assertBranchAccess(user, ref.fromBranchId, lang);

    await this.dataSource.transaction(async (m) => {
      const transfer = await m.findOne(ParcelTransfer, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!transfer) throw new NotFoundException(this.t('branch_stock.transfer_not_found', lang));
      if (transfer.status !== TransferStatus.IN_TRANSIT || transfer.receivedPieces > 0) {
        throw new BadRequestException(this.t('branch_stock.transfer_not_cancellable', lang, { code: transfer.code, status: transfer.status }));
      }
      const open = await m.count(ParcelCheckin, { where: { transferId: id, status: CheckinStatus.OPEN } });
      if (open) throw new BadRequestException(this.t('branch_stock.transfer_checkin_open', lang, { code: transfer.code }));

      const items = await m.find(ParcelTransferItem, { where: { transferId: id } });
      for (const ti of items) {
        if (ti.status !== TransferItemStatus.IN_TRANSIT || ti.quantity <= 0) continue;
        const { stock: back } = await this.stock.applyMovement(
          m,
          ti.fromStockId,
          BranchMovementType.IN_TRANSFER,
          ti.quantity,
          { reason: `Annulation du transfert ${transfer.code}`, note: dto.reason, reference: `${transfer.code}:ANNULATION`, transferId: id, performedById: user?.id ?? null },
          lang,
        );
        ti.status = TransferItemStatus.CANCELLED;
        await m.save(ParcelTransferItem, ti);

        const shipment = await m.findOne(Shipment, { where: { id: ti.shipmentId } });
        if (shipment) {
          await this.addTracking(m, shipment, this.location(from), `Transfert ${transfer.code} annulé : ${ti.quantity} pièce(s) remise(s) en stock à ${from.name}`);
        }
        await this.supplyHistory.recordForShipment(
          ti.shipmentId,
          {
            eventType: SupplyEventType.STOCK_MOVEMENT,
            description: `Transfert ${transfer.code} annulé (${dto.reason}) : ${ti.quantity} pièce(s) de retour à ${from.name}, stock ${back.quantityAvailable}`,
            branchId: from.id,
            performedById: user?.id ?? null,
            payload: { transferId: id, code: transfer.code, quantity: ti.quantity },
          },
          m,
        );
      }

      transfer.status = TransferStatus.CANCELLED;
      transfer.missingPieces = 0;
      transfer.cancelledById = user?.id ?? null;
      transfer.cancelledAt = new Date();
      transfer.cancelReason = dto.reason;
      await m.save(ParcelTransfer, transfer);
    });

    return { message: this.t('branch_stock.transfer_cancelled', lang, { code: ref.code }), data: await this.loadTransfer(id) };
  }

  /** Après une réception partielle : les pièces jamais arrivées reviennent dans le stock de départ */
  async returnMissing(id: string, dto: ReturnMissingDto, user: UserEntity, lang: string) {
    const ref = await this.dataSource.manager.findOne(ParcelTransfer, { where: { id } });
    if (!ref) throw new NotFoundException(this.t('branch_stock.transfer_not_found', lang));
    const from = await this.stock.assertBranchAccess(user, ref.fromBranchId, lang);

    const returned = await this.dataSource.transaction(async (m) => {
      const transfer = await m.findOne(ParcelTransfer, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!transfer) throw new NotFoundException(this.t('branch_stock.transfer_not_found', lang));
      if (transfer.status !== TransferStatus.PARTIALLY_RECEIVED) {
        throw new BadRequestException(this.t('branch_stock.transfer_nothing_to_return', lang, { code: transfer.code }));
      }
      const open = await m.count(ParcelCheckin, { where: { transferId: id, status: CheckinStatus.OPEN } });
      if (open) throw new BadRequestException(this.t('branch_stock.transfer_checkin_open', lang, { code: transfer.code }));

      const items = await m.find(ParcelTransferItem, { where: { transferId: id } });
      let total = 0;
      for (const ti of items) {
        const rest = this.remaining(ti);
        if (rest <= 0 || ti.status === TransferItemStatus.CANCELLED) continue;
        await this.stock.applyMovement(
          m,
          ti.fromStockId,
          BranchMovementType.IN_TRANSFER,
          rest,
          { reason: `Manquants du transfert ${transfer.code}`, note: dto.note ?? null, reference: `${transfer.code}:RETOUR`, transferId: id, performedById: user?.id ?? null },
          lang,
        );
        ti.returnedQty += rest;
        ti.status = this.transferItemStatus(ti);
        await m.save(ParcelTransferItem, ti);
        total += rest;

        const shipment = await m.findOne(Shipment, { where: { id: ti.shipmentId } });
        if (shipment) {
          await this.addTracking(m, shipment, this.location(from), `Transfert ${transfer.code} : ${rest} pièce(s) non arrivée(s), remise(s) en stock à ${from.name}`);
        }
        await this.supplyHistory.recordForShipment(
          ti.shipmentId,
          {
            eventType: SupplyEventType.STOCK_MOVEMENT,
            description: `Transfert ${transfer.code} : ${rest} pièce(s) manquante(s) remise(s) en stock à ${from.name}`,
            branchId: from.id,
            performedById: user?.id ?? null,
            payload: { transferId: id, code: transfer.code, quantity: rest },
          },
          m,
        );
      }
      if (total <= 0) throw new BadRequestException(this.t('branch_stock.transfer_nothing_to_return', lang, { code: transfer.code }));

      transfer.returnedPieces += total;
      transfer.missingPieces = 0;
      transfer.status = TransferStatus.CLOSED;
      await m.save(ParcelTransfer, transfer);
      return total;
    });

    return { message: this.t('branch_stock.transfer_returned', lang, { code: ref.code, pieces: returned, branch: from.name }), data: await this.loadTransfer(id) };
  }

  // ============================================================
  // 2. POINTAGE À L'ARRIVÉE (branche de destination)
  // ============================================================

  /** Ouvre (ou reprend) le pointage de réception d'un transfert */
  async openTransferCheckin(dto: OpenTransferCheckinDto, user: UserEntity, lang: string) {
    const ref = await this.dataSource.manager.findOne(ParcelTransfer, { where: { id: dto.transferId } });
    if (!ref) throw new NotFoundException(this.t('branch_stock.transfer_not_found', lang));
    // Seule la branche d'arrivée pointe
    const branch = await this.stock.assertBranchAccess(user, ref.toBranchId, lang);

    const { checkin, existing } = await this.dataSource.transaction(async (m) => {
      const transfer = await m.findOne(ParcelTransfer, { where: { id: dto.transferId }, lock: { mode: 'pessimistic_write' } });
      if (!transfer) throw new NotFoundException(this.t('branch_stock.transfer_not_found', lang));

      // Un seul pointage ouvert par transfert : on reprend celui qui existe
      const open = await m.findOne(ParcelCheckin, { where: { transferId: transfer.id, status: CheckinStatus.OPEN } });
      if (open) return { checkin: open, existing: true };

      if (!TRANSFER_RECEIVABLE.includes(transfer.status)) {
        throw new BadRequestException(this.t('branch_stock.transfer_not_receivable', lang, { code: transfer.code, status: transfer.status }));
      }
      const tItems = (await m.find(ParcelTransferItem, { where: { transferId: transfer.id } })).filter(
        (ti) => ti.status !== TransferItemStatus.CANCELLED && this.remaining(ti) > 0,
      );
      if (!tItems.length) {
        throw new BadRequestException(this.t('branch_stock.transfer_not_receivable', lang, { code: transfer.code, status: transfer.status }));
      }

      const created = await m.save(
        ParcelCheckin,
        m.create(ParcelCheckin, {
          code: await this.newCode(m, 'PT', ParcelCheckin),
          type: CheckinType.TRANSFER_RECEPTION,
          status: CheckinStatus.OPEN,
          branchId: branch.id,
          companyId: branch.company_id ?? null,
          ltaId: transfer.ltaId ?? null,
          transferId: transfer.id,
          shipmentStatus: dto.shipmentStatus ?? null,
          note: dto.note ?? null,
          openedById: user?.id ?? null,
        }),
      );
      const rows = tItems.map((ti) =>
        m.create(ParcelCheckinItem, {
          checkinId: created.id,
          shipmentId: ti.shipmentId,
          trackingNumber: String(ti.trackingNumber).trim().toUpperCase(),
          description: ti.description ?? null,
          clientName: ti.clientName ?? null,
          clientPhone: ti.clientPhone ?? null,
          expectedQty: this.remaining(ti),
          checkedQty: 0,
          status: CheckinItemStatus.PENDING,
          transferItemId: ti.id,
        }),
      );
      await m.save(ParcelCheckinItem, rows);
      this.computeCounters(created, rows);
      return { checkin: await m.save(ParcelCheckin, created), existing: false };
    });

    return {
      message: this.t(existing ? 'branch_stock.checkin_existing' : 'branch_stock.checkin_opened', lang, {
        code: checkin.code,
        transfer: ref.code,
        parcels: checkin.expectedParcels,
      }),
      data: await this.loadCheckin(checkin.id),
    };
  }

  /** Scan d'un colis : aucun effet sur le stock avant la clôture */
  async scan(checkinId: string, dto: ScanParcelDto, user: UserEntity, lang: string) {
    const ref = await this.dataSource.manager.findOne(ParcelCheckin, { where: { id: checkinId } });
    if (!ref) throw new NotFoundException(this.t('branch_stock.checkin_not_found', lang));
    await this.stock.assertBranchAccess(user, ref.branchId, lang);
    const code = String(dto.code ?? '').trim().toUpperCase();
    if (!code) throw new BadRequestException(this.t('branch_stock.scan_code_required', lang));

    const result = await this.dataSource.transaction(async (m) => {
      const checkin = await this.lockOpenCheckin(m, checkinId, lang);
      const now = new Date();
      let outcome: ScanOutcome;
      let item = await m.findOne(ParcelCheckinItem, { where: { checkinId, trackingNumber: code } });

      if (item && item.expectedQty > 0) {
        // Colis attendu
        const left = item.expectedQty - item.checkedQty;
        if (left <= 0) {
          outcome = 'ALREADY_CHECKED';
        } else {
          const add = dto.quantity ?? left;
          if (add > left) {
            throw new BadRequestException(
              this.t('branch_stock.scan_exceeds', lang, { tracking: item.trackingNumber, expected: item.expectedQty, checked: item.checkedQty }),
            );
          }
          item.checkedQty += add;
          item.status = item.checkedQty >= item.expectedQty ? CheckinItemStatus.CHECKED : CheckinItemStatus.PARTIAL;
          outcome = item.status === CheckinItemStatus.CHECKED ? 'CHECKED' : 'PARTIAL';
        }
      } else if (item) {
        // Colis non prévu / code inconnu scanné une nouvelle fois
        item.checkedQty += dto.quantity ?? 1;
        outcome = item.status === CheckinItemStatus.UNKNOWN ? 'UNKNOWN' : 'UNEXPECTED';
      } else {
        // Pas dans ce transfert : colis connu (non prévu) ou code inconnu
        const shipment = await m.findOne(Shipment, { where: { trackingNumber: code }, relations: ['package', 'user'] });
        item = m.create(ParcelCheckinItem, {
          checkinId,
          shipmentId: shipment?.id ?? null,
          trackingNumber: code,
          description: shipment?.package?.description ? String(shipment.package.description).slice(0, 255) : null,
          clientName: shipment ? shipment.clientName || shipment.user?.fullName || null : null,
          clientPhone: shipment ? shipment.clientPhone || shipment.user?.phone || null : null,
          expectedQty: 0,
          checkedQty: dto.quantity ?? (shipment ? this.expectedPieces(shipment) : 1),
          status: shipment ? CheckinItemStatus.UNEXPECTED : CheckinItemStatus.UNKNOWN,
        });
        outcome = shipment ? 'UNEXPECTED' : 'UNKNOWN';
      }

      if (dto.damaged !== undefined) item.damaged = dto.damaged;
      if (dto.note) item.note = dto.note;
      if (!item.firstCheckedAt) item.firstCheckedAt = now;
      item.lastCheckedAt = now;
      item.checkedById = user?.id ?? null;
      item = await m.save(ParcelCheckinItem, item);
      const updated = await this.refreshCounters(m, checkin);
      return { outcome, item, progress: this.progress(updated) };
    });

    const keys: Record<ScanOutcome, string> = {
      CHECKED: 'branch_stock.scan_ok',
      PARTIAL: 'branch_stock.scan_partial',
      ALREADY_CHECKED: 'branch_stock.scan_already_checked',
      UNEXPECTED: 'branch_stock.scan_unexpected',
      UNKNOWN: 'branch_stock.scan_unknown',
    };
    return {
      message: this.t(keys[result.outcome], lang, {
        tracking: result.item.trackingNumber,
        code,
        checked: result.item.checkedQty,
        expected: result.item.expectedQty,
      }),
      data: result,
    };
  }

  /** Correction d'une ligne (quantité pointée, colis abîmé, note) */
  async updateItem(checkinId: string, itemId: string, dto: UpdateCheckinItemDto, user: UserEntity, lang: string) {
    const ref = await this.dataSource.manager.findOne(ParcelCheckin, { where: { id: checkinId } });
    if (!ref) throw new NotFoundException(this.t('branch_stock.checkin_not_found', lang));
    await this.stock.assertBranchAccess(user, ref.branchId, lang);

    const result = await this.dataSource.transaction(async (m) => {
      const checkin = await this.lockOpenCheckin(m, checkinId, lang);
      const item = await m.findOne(ParcelCheckinItem, { where: { id: itemId, checkinId } });
      if (!item) throw new NotFoundException(this.t('branch_stock.checkin_item_not_found', lang));

      if (dto.checkedQty !== undefined) {
        if (item.expectedQty > 0) {
          if (dto.checkedQty > item.expectedQty) {
            throw new BadRequestException(
              this.t('branch_stock.scan_exceeds', lang, { tracking: item.trackingNumber, expected: item.expectedQty, checked: item.checkedQty }),
            );
          }
          item.checkedQty = dto.checkedQty;
          item.status =
            item.checkedQty <= 0
              ? CheckinItemStatus.PENDING
              : item.checkedQty >= item.expectedQty
                ? CheckinItemStatus.CHECKED
                : CheckinItemStatus.PARTIAL;
        } else {
          item.checkedQty = dto.checkedQty;
        }
      }
      if (dto.damaged !== undefined) item.damaged = dto.damaged;
      if (dto.note !== undefined) item.note = dto.note || null;
      item.lastCheckedAt = new Date();
      item.checkedById = user?.id ?? null;
      const saved = await m.save(ParcelCheckinItem, item);
      const updated = await this.refreshCounters(m, checkin);
      return { item: saved, progress: this.progress(updated) };
    });

    return { message: this.t('branch_stock.checkin_item_updated', lang, { tracking: result.item.trackingNumber }), data: result };
  }

  /** Retirer un colis non prévu / un code inconnu scanné par erreur */
  async removeItem(checkinId: string, itemId: string, user: UserEntity, lang: string) {
    const ref = await this.dataSource.manager.findOne(ParcelCheckin, { where: { id: checkinId } });
    if (!ref) throw new NotFoundException(this.t('branch_stock.checkin_not_found', lang));
    await this.stock.assertBranchAccess(user, ref.branchId, lang);

    const progress = await this.dataSource.transaction(async (m) => {
      const checkin = await this.lockOpenCheckin(m, checkinId, lang);
      const item = await m.findOne(ParcelCheckinItem, { where: { id: itemId, checkinId } });
      if (!item) throw new NotFoundException(this.t('branch_stock.checkin_item_not_found', lang));
      if (item.expectedQty > 0) {
        throw new BadRequestException(this.t('branch_stock.checkin_item_remove_expected', lang, { tracking: item.trackingNumber }));
      }
      await m.delete(ParcelCheckinItem, { id: item.id });
      return this.progress(await this.refreshCounters(m, checkin));
    });

    return { message: this.t('branch_stock.checkin_item_removed', lang), data: { progress } };
  }

  /**
   * Clôture : les pièces pointées ENTRENT dans le stock de la branche (IN_TRANSFER),
   * les pièces non pointées restent « manquantes » sur le transfert.
   */
  async closeCheckin(checkinId: string, dto: CloseCheckinDto, user: UserEntity, lang: string) {
    const ref = await this.dataSource.manager.findOne(ParcelCheckin, { where: { id: checkinId } });
    if (!ref) throw new NotFoundException(this.t('branch_stock.checkin_not_found', lang));
    await this.stock.assertBranchAccess(user, ref.branchId, lang);

    const summary = await this.dataSource.transaction(async (m) => {
      const checkin = await this.lockOpenCheckin(m, checkinId, lang);
      const branch = await m.findOne(BranchEntity, { where: { id: checkin.branchId } });
      if (!branch) throw new NotFoundException(this.t('branch_stock.branch_not_found', lang));
      const transfer = checkin.transferId
        ? await m.findOne(ParcelTransfer, { where: { id: checkin.transferId }, lock: { mode: 'pessimistic_write' } })
        : null;
      if (!transfer) throw new NotFoundException(this.t('branch_stock.transfer_not_found', lang));
      const fromBranch = await m.findOne(BranchEntity, { where: { id: transfer.fromBranchId } });
      const fromName = fromBranch?.name ?? '';
      const location = this.location(branch);
      const statusToSet = (dto.shipmentStatus ?? checkin.shipmentStatus ?? null) as ShipmentStatus | null;

      const items = await m.find(ParcelCheckinItem, { where: { checkinId } });
      let received = 0;

      for (const item of items) {
        if (item.expectedQty > 0 && item.transferItemId) {
          const ti = await m.findOne(ParcelTransferItem, { where: { id: item.transferItemId } });
          if (!ti) {
            item.status = CheckinItemStatus.MISSING;
            item.closeResult = this.t('branch_stock.transfer_not_found', lang);
            await m.save(ParcelCheckinItem, item);
            continue;
          }
          const qty = Math.min(item.checkedQty, this.remaining(ti));
          if (qty > 0) {
            const shipment = await m.findOne(Shipment, { where: { id: ti.shipmentId }, relations: ['package', 'user'] });
            if (!shipment) {
              item.status = CheckinItemStatus.MISSING;
              item.closeResult = this.t('branch_stock.shipment_not_found', lang);
              await m.save(ParcelCheckinItem, item);
              continue;
            }
            const fromStock = await m.findOne(BranchParcelStock, { where: { id: ti.fromStockId } });
            const target = await this.stock.getOrCreateStock(m, branch, shipment, {
              ltaId: transfer.ltaId ?? fromStock?.ltaId ?? null,
              receivedById: user?.id ?? null,
            });
            const { stock: inStock, movement } = await this.stock.applyMovement(
              m,
              target.id,
              BranchMovementType.IN_TRANSFER,
              qty,
              {
                reason: `Transfert ${transfer.code} depuis ${fromName}`,
                note: [item.damaged ? 'Colis abîmé' : null, item.note].filter(Boolean).join(' — ') || null,
                reference: transfer.code,
                transferId: transfer.id,
                performedById: user?.id ?? null,
              },
              lang,
            );
            ti.receivedQty += qty;
            ti.toStockId = inStock.id;
            ti.inMovementId = movement.id;
            item.stockId = inStock.id;
            item.movementId = movement.id;
            received += qty;

            if (statusToSet && statusToSet !== shipment.status) {
              shipment.status = statusToSet;
              await m.save(Shipment, shipment);
            }
            await this.addTracking(
              m,
              shipment,
              location,
              `Reçu à la branche ${branch.name} (transfert ${transfer.code} depuis ${fromName}) : ${qty} pièce(s)${item.damaged ? ' — colis abîmé' : ''}`,
            );
            await this.supplyHistory.recordForShipment(
              shipment.id,
              {
                eventType: SupplyEventType.TRANSFER_RECEIVED,
                description: `Transfert ${transfer.code} reçu à ${branch.name} : ${qty} pièce(s) (stock : ${inStock.quantityAvailable})`,
                branchId: branch.id,
                ltaId: inStock.ltaId ?? null,
                location,
                performedById: user?.id ?? null,
                payload: { transferId: transfer.id, checkinId, stockId: inStock.id, movementId: movement.id, quantity: qty, damaged: item.damaged },
              },
              m,
              SupplyStatus.RECEIVED_AT_BRANCH,
            );
          }
          item.status =
            item.checkedQty <= 0
              ? CheckinItemStatus.MISSING
              : item.checkedQty < item.expectedQty
                ? CheckinItemStatus.PARTIAL
                : CheckinItemStatus.CHECKED;
          ti.status = this.transferItemStatus(ti);
          await m.save(ParcelTransferItem, ti);
        } else if (item.status === CheckinItemStatus.UNEXPECTED) {
          item.closeResult = this.t('branch_stock.close_unexpected_note', lang);
        } else if (item.status === CheckinItemStatus.UNKNOWN) {
          item.closeResult = this.t('branch_stock.close_unknown_note', lang);
        }
        await m.save(ParcelCheckinItem, item);
      }

      // Transfert : reçu en entier, ou reçu avec des manquants
      const tItems = await m.find(ParcelTransferItem, { where: { transferId: transfer.id } });
      const active = tItems.filter((ti) => ti.status !== TransferItemStatus.CANCELLED);
      transfer.receivedPieces = active.reduce((s, ti) => s + ti.receivedQty, 0);
      transfer.returnedPieces = active.reduce((s, ti) => s + ti.returnedQty, 0);
      transfer.missingPieces = active.reduce((s, ti) => s + this.remaining(ti), 0);
      transfer.status = transfer.missingPieces > 0 ? TransferStatus.PARTIALLY_RECEIVED : TransferStatus.RECEIVED;
      transfer.receivedById = user?.id ?? null;
      transfer.receivedAt = new Date();
      await m.save(ParcelTransfer, transfer);

      // Séance clôturée
      this.computeCounters(checkin, items, true);
      checkin.status = CheckinStatus.CLOSED;
      checkin.closedById = user?.id ?? null;
      checkin.closedAt = new Date();
      if (dto.shipmentStatus) checkin.shipmentStatus = dto.shipmentStatus;
      if (dto.note) checkin.note = [checkin.note, dto.note].filter(Boolean).join('\n');
      await m.save(ParcelCheckin, checkin);

      return { received, missing: transfer.missingPieces, transferStatus: transfer.status };
    });

    return {
      message: this.t('branch_stock.checkin_closed', lang, { code: ref.code, received: summary.received, missing: summary.missing }),
      data: { ...summary, checkin: await this.loadCheckin(checkinId) },
    };
  }

  /** Annuler un pointage ouvert (aucun effet sur le stock ; le transfert reste à recevoir) */
  async cancelCheckin(checkinId: string, dto: CancelCheckinDto, user: UserEntity, lang: string) {
    const ref = await this.dataSource.manager.findOne(ParcelCheckin, { where: { id: checkinId } });
    if (!ref) throw new NotFoundException(this.t('branch_stock.checkin_not_found', lang));
    await this.stock.assertBranchAccess(user, ref.branchId, lang);

    await this.dataSource.transaction(async (m) => {
      const checkin = await this.lockOpenCheckin(m, checkinId, lang);
      checkin.status = CheckinStatus.CANCELLED;
      checkin.cancelReason = dto.reason;
      checkin.closedById = user?.id ?? null;
      checkin.closedAt = new Date();
      await m.save(ParcelCheckin, checkin);
    });

    return { message: this.t('branch_stock.checkin_cancelled', lang, { code: ref.code }), data: await this.loadCheckin(checkinId) };
  }

  async listCheckins(query: CheckinQueryDto, user: UserEntity, lang: string) {
    if (query.branchId) {
      await this.stock.assertBranchAccess(user, query.branchId, lang);
    } else if (query.transferId) {
      const transfer = await this.dataSource.manager.findOne(ParcelTransfer, { where: { id: query.transferId } });
      if (!transfer) throw new NotFoundException(this.t('branch_stock.transfer_not_found', lang));
      await this.assertAnyBranchAccess(user, [transfer.fromBranchId, transfer.toBranchId], lang);
    } else if (!this.isAdmin(user)) {
      throw new BadRequestException(this.t('branch_stock.branch_required', lang));
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 20));
    const qb = this.dataSource.manager
      .createQueryBuilder(ParcelCheckin, 'c')
      .leftJoin('c.branch', 'branch')
      .addSelect(['branch.id', 'branch.name'])
      .leftJoin('c.transfer', 'transfer')
      .addSelect(['transfer.id', 'transfer.code', 'transfer.fromBranchId', 'transfer.status'])
      .leftJoin('c.openedBy', 'openedBy')
      .addSelect(['openedBy.id', 'openedBy.fullName']);
    if (query.branchId) qb.andWhere('c.branchId = :branchId', { branchId: query.branchId });
    if (query.transferId) qb.andWhere('c.transferId = :transferId', { transferId: query.transferId });
    if (query.status) qb.andWhere('c.status = :status', { status: query.status });

    const [items, total] = await qb
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { message: this.t('branch_stock.checkin_list', lang), data: new PaginatedResponseDto(items, total, page, limit) };
  }

  async getCheckin(checkinId: string, user: UserEntity, lang: string) {
    const ref = await this.dataSource.manager.findOne(ParcelCheckin, { where: { id: checkinId } });
    if (!ref) throw new NotFoundException(this.t('branch_stock.checkin_not_found', lang));
    await this.stock.assertBranchAccess(user, ref.branchId, lang);
    const checkin = await this.loadCheckin(checkinId);
    return { message: this.t('branch_stock.checkin_detail', lang), data: checkin ? { ...checkin, progress: this.progress(checkin) } : null };
  }

  /** Transferts qu'une branche doit encore recevoir (raccourci pour l'écran de pointage) */
  async incoming(branchId: string, user: UserEntity, lang: string) {
    await this.stock.assertBranchAccess(user, branchId, lang);
    const transfers = await this.dataSource.manager
      .createQueryBuilder(ParcelTransfer, 't')
      .leftJoin('t.fromBranch', 'fromBranch')
      .addSelect(['fromBranch.id', 'fromBranch.name'])
      .where('t.toBranchId = :branchId', { branchId })
      .andWhere('t.status IN (:...st)', { st: TRANSFER_RECEIVABLE })
      .orderBy('t.sentAt', 'ASC')
      .getMany();
    const ids = transfers.map((t) => t.id);
    const open = ids.length
      ? await this.dataSource.manager.find(ParcelCheckin, { where: { transferId: In(ids), status: CheckinStatus.OPEN } })
      : [];
    return {
      message: this.t('branch_stock.transfer_list', lang),
      data: transfers.map((t) => ({ ...t, openCheckin: open.find((c) => c.transferId === t.id) ?? null })),
    };
  }
}
