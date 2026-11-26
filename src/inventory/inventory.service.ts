import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { CompanyCapabilitiesService } from './capabilities/company-capabilities.service';
import { CompanyCapabilities } from './capabilities/company-capabilities';
import { StockLocation } from './entities/stock-location.entity';
import { StockItem } from './entities/stock-item.entity';
import { StockLot } from './entities/stock-lot.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { ProductPharmaMeta } from './entities/product-pharma-meta.entity';
import { StockLocationType, StockLotStatus, StockMovementSource, StockMovementType } from './enums/inventory.enum';
import { AdjustStockDto, ConsumeStockDto, CreateLocationDto, ExpiringQueryDto, ReceiveStockDto, StockQueryDto, TransferStockDto } from './dto/inventory.dto';

const r3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

/** Options d'une sortie de stock (réutilisées par le POS et la synchro offline) */
export interface ConsumeOptions {
  source?: StockMovementSource;
  reference?: string | null;
  reason?: string | null;
  performedById?: string | null;
  hasPrescription?: boolean;
}

export interface ReceiveOptions {
  source?: StockMovementSource;
  reference?: string | null;
  reason?: string | null;
  performedById?: string | null;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly capabilities: CompanyCapabilitiesService,
  ) {}

  private t(key: string, lang: string, args?: any) {
    return this.i18n.translate(key, lang, args);
  }

  /** Vérifie que l'entreprise gère l'inventaire, sinon 403 */
  async assertInventory(companyId: string, lang: string): Promise<CompanyCapabilities> {
    const caps = await this.capabilities.forCompany(companyId);
    if (!caps.hasInventory) throw new ForbiddenException(this.t('inventory.not_enabled_for_type', lang));
    return caps;
  }

  // ============================================================
  // EMPLACEMENTS
  // ============================================================
  async createLocation(companyId: string, dto: CreateLocationDto, lang: string) {
    await this.assertInventory(companyId, lang);
    const repo = this.dataSource.getRepository(StockLocation);
    if (dto.isDefaultSale) await repo.update({ companyId, isDefaultSale: true }, { isDefaultSale: false });
    const loc = repo.create({
      companyId,
      branchId: dto.branchId ?? null,
      name: dto.name,
      type: dto.type ?? StockLocationType.SHELF,
      isDefaultSale: !!dto.isDefaultSale,
      isActive: true,
    });
    return repo.save(loc);
  }

  async listLocations(companyId: string, lang: string) {
    await this.assertInventory(companyId, lang);
    return this.dataSource.getRepository(StockLocation).find({ where: { companyId, isActive: true }, order: { name: 'ASC' } });
  }

  /** Emplacement de vente par défaut d'une entreprise (pour le POS) */
  async defaultSaleLocationId(companyId: string): Promise<string | null> {
    const repo = this.dataSource.getRepository(StockLocation);
    const def = await repo.findOne({ where: { companyId, isDefaultSale: true, isActive: true } });
    if (def) return def.id;
    const any = await repo.findOne({ where: { companyId, isActive: true }, order: { createdAt: 'ASC' } });
    return any?.id ?? null;
  }

  // ============================================================
  // RÉCEPTION (ENTRÉE)
  // ============================================================
  async receive(companyId: string, dto: ReceiveStockDto, lang: string, performedById?: string) {
    const caps = await this.assertInventory(companyId, lang);
    return this.dataSource.transaction((m) => this.receiveInTx(m, companyId, dto, caps, lang, { performedById }));
  }

  /** Cœur de la réception (utilisable dans une transaction externe : POS, synchro) */
  async receiveInTx(m: EntityManager, companyId: string, dto: ReceiveStockDto, caps: CompanyCapabilities, lang: string, opts: ReceiveOptions = {}) {
    const qty = r3(dto.quantity);
    if (qty <= 0) throw new BadRequestException(this.t('inventory.invalid_quantity', lang));
    await this.ensureLocation(m, companyId, dto.locationId, lang);

    let lotId: string | null = null;
    if (caps.tracksLots) {
      if (caps.tracksExpiry && !dto.expiryDate) throw new BadRequestException(this.t('inventory.expiry_required', lang));
      const lotRepo = m.getRepository(StockLot);
      const lotNumber = (dto.lotNumber || '').trim() || `LOT-${Date.now()}`;
      let lot = await lotRepo.findOne({ where: { companyId, locationId: dto.locationId, productId: dto.productId, lotNumber } });
      if (lot) {
        lot.quantity = r3(lot.quantity + qty);
        if (lot.status === StockLotStatus.DEPLETED) lot.status = StockLotStatus.ACTIVE;
      } else {
        lot = lotRepo.create({
          companyId, locationId: dto.locationId, productId: dto.productId, lotNumber,
          expiryDate: dto.expiryDate ?? null, quantity: qty, costPrice: dto.costPrice ?? null,
          supplier: dto.supplier ?? null, status: StockLotStatus.ACTIVE,
        });
      }
      lot = await lotRepo.save(lot);
      lotId = lot.id;
    }

    const balance = await this.bumpStockItem(m, companyId, dto.locationId, dto.productId, qty);
    await this.writeMovement(m, {
      companyId, locationId: dto.locationId, productId: dto.productId, lotId,
      type: StockMovementType.IN, source: opts.source ?? StockMovementSource.MANUAL,
      quantity: qty, balanceAfter: balance, reference: opts.reference ?? dto.reference ?? null,
      reason: opts.reason ?? dto.reason ?? null, performedById: opts.performedById ?? null,
    });
    return { message: this.t('inventory.received', lang), balance };
  }

  // ============================================================
  // SORTIE (VENTE / CONSOMMATION) — FEFO si lots
  // ============================================================
  async consume(companyId: string, dto: ConsumeStockDto, lang: string, opts: ConsumeOptions = {}) {
    const caps = await this.assertInventory(companyId, lang);
    return this.dataSource.transaction((m) => this.consumeInTx(m, companyId, dto, caps, lang, opts));
  }

  /** Cœur de la sortie (utilisable dans une transaction externe : POS, synchro) */
  async consumeInTx(m: EntityManager, companyId: string, dto: ConsumeStockDto, caps: CompanyCapabilities, lang: string, opts: ConsumeOptions = {}) {
    const qty = r3(dto.quantity);
    if (qty <= 0) throw new BadRequestException(this.t('inventory.invalid_quantity', lang));

    // Ordonnance : si le type l'exige ET que le produit est sur ordonnance
    if (caps.requiresPrescription) {
      const meta = await m.getRepository(ProductPharmaMeta).findOne({ where: { productId: dto.productId } });
      if (meta?.requiresPrescription && !(opts.hasPrescription ?? dto.hasPrescription)) {
        throw new BadRequestException(this.t('inventory.prescription_required', lang));
      }
    }

    const consumedLots: { lotId: string; quantity: number }[] = [];
    if (caps.tracksLots) {
      const lots = await m.getRepository(StockLot).createQueryBuilder('l')
        .where('l.companyId = :companyId AND l.productId = :productId AND l.locationId = :locationId', {
          companyId, productId: dto.productId, locationId: dto.locationId,
        })
        .andWhere('l.status = :active AND l.quantity > 0', { active: StockLotStatus.ACTIVE })
        .orderBy('l.expiryDate IS NULL', 'ASC')
        .addOrderBy('l.expiryDate', 'ASC')
        .addOrderBy('l.createdAt', 'ASC')
        .setLock('pessimistic_write')
        .getMany();

      let remaining = qty;
      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(lot.quantity, remaining);
        lot.quantity = r3(lot.quantity - take);
        if (lot.quantity <= 0) lot.status = StockLotStatus.DEPLETED;
        await m.getRepository(StockLot).save(lot);
        consumedLots.push({ lotId: lot.id, quantity: r3(take) });
        remaining = r3(remaining - take);
      }
      if (remaining > 0 && !caps.allowNegativeStock) throw new BadRequestException(this.t('inventory.insufficient_stock', lang));
    }

    const balance = await this.bumpStockItem(m, companyId, dto.locationId, dto.productId, -qty, caps.allowNegativeStock, lang);

    if (consumedLots.length) {
      for (const c of consumedLots) {
        await this.writeMovement(m, {
          companyId, locationId: dto.locationId, productId: dto.productId, lotId: c.lotId,
          type: StockMovementType.OUT, source: opts.source ?? StockMovementSource.MANUAL, quantity: c.quantity,
          balanceAfter: null, reference: opts.reference ?? dto.reference ?? null,
          reason: opts.reason ?? dto.reason ?? null, performedById: opts.performedById ?? null,
        });
      }
    } else {
      await this.writeMovement(m, {
        companyId, locationId: dto.locationId, productId: dto.productId, lotId: null,
        type: StockMovementType.OUT, source: opts.source ?? StockMovementSource.MANUAL, quantity: qty,
        balanceAfter: balance, reference: opts.reference ?? dto.reference ?? null,
        reason: opts.reason ?? dto.reason ?? null, performedById: opts.performedById ?? null,
      });
    }
    return { message: this.t('inventory.consumed', lang), balance };
  }

  // ============================================================
  // AJUSTEMENT D'INVENTAIRE
  // ============================================================
  async adjust(companyId: string, dto: AdjustStockDto, lang: string, performedById?: string) {
    await this.assertInventory(companyId, lang);
    const counted = r3(dto.countedQuantity);
    if (counted < 0) throw new BadRequestException(this.t('inventory.invalid_quantity', lang));

    return this.dataSource.transaction(async (m) => {
      const item = await m.getRepository(StockItem).findOne({ where: { companyId, locationId: dto.locationId, productId: dto.productId } });
      const current = item ? item.quantity : 0;
      const delta = r3(counted - current);
      const balance = await this.bumpStockItem(m, companyId, dto.locationId, dto.productId, delta, true);
      await this.writeMovement(m, {
        companyId, locationId: dto.locationId, productId: dto.productId, lotId: dto.lotId ?? null,
        type: StockMovementType.ADJUST, source: StockMovementSource.INVENTORY, quantity: Math.abs(delta),
        balanceAfter: balance, reference: null, reason: dto.reason ?? 'Ajustement inventaire', performedById: performedById ?? null,
      });
      return { message: this.t('inventory.adjusted', lang), balance, delta };
    });
  }

  // ============================================================
  // TRANSFERT ENTRE EMPLACEMENTS
  // ============================================================
  async transfer(companyId: string, dto: TransferStockDto, lang: string, performedById?: string) {
    const caps = await this.assertInventory(companyId, lang);
    const qty = r3(dto.quantity);
    if (qty <= 0) throw new BadRequestException(this.t('inventory.invalid_quantity', lang));
    if (dto.fromLocationId === dto.toLocationId) throw new BadRequestException(this.t('inventory.same_location', lang));

    return this.dataSource.transaction(async (m) => {
      await this.ensureLocation(m, companyId, dto.toLocationId, lang);
      const ref = `TRF-${Date.now()}`;
      const outBalance = await this.bumpStockItem(m, companyId, dto.fromLocationId, dto.productId, -qty, caps.allowNegativeStock, lang);
      const inBalance = await this.bumpStockItem(m, companyId, dto.toLocationId, dto.productId, qty);
      await this.writeMovement(m, {
        companyId, locationId: dto.fromLocationId, productId: dto.productId, lotId: null,
        type: StockMovementType.TRANSFER_OUT, source: StockMovementSource.TRANSFER, quantity: qty,
        balanceAfter: outBalance, reference: ref, reason: dto.reason ?? null, performedById: performedById ?? null,
      });
      await this.writeMovement(m, {
        companyId, locationId: dto.toLocationId, productId: dto.productId, lotId: null,
        type: StockMovementType.TRANSFER_IN, source: StockMovementSource.TRANSFER, quantity: qty,
        balanceAfter: inBalance, reference: ref, reason: dto.reason ?? null, performedById: performedById ?? null,
      });
      return { message: this.t('inventory.transferred', lang), reference: ref };
    });
  }

  // ============================================================
  // CONSULTATIONS
  // ============================================================
  async listStock(companyId: string, query: StockQueryDto, lang: string) {
    await this.assertInventory(companyId, lang);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const qb = this.dataSource.getRepository(StockItem).createQueryBuilder('s').where('s.companyId = :companyId', { companyId });
    if (query.locationId) qb.andWhere('s.locationId = :locationId', { locationId: query.locationId });
    if (query.productId) qb.andWhere('s.productId = :productId', { productId: query.productId });
    if (query.lowStockOnly) qb.andWhere('s.minQuantity > 0 AND s.quantity <= s.minQuantity');
    qb.orderBy('s.updatedAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async lowStock(companyId: string, lang: string) {
    await this.assertInventory(companyId, lang);
    return this.dataSource.getRepository(StockItem).createQueryBuilder('s')
      .where('s.companyId = :companyId AND s.minQuantity > 0 AND s.quantity <= s.minQuantity', { companyId })
      .orderBy('s.quantity', 'ASC').getMany();
  }

  /** Lots périmant d'ici `days` jours (pharmacie / denrées) */
  async expiringSoon(companyId: string, query: ExpiringQueryDto, lang: string) {
    const caps = await this.assertInventory(companyId, lang);
    if (!caps.tracksExpiry) return { data: [], message: this.t('inventory.expiry_not_tracked', lang) };
    const days = Math.max(1, Number(query.days) || 30);
    const qb = this.dataSource.getRepository(StockLot).createQueryBuilder('l')
      .where('l.companyId = :companyId AND l.status = :active AND l.quantity > 0', { companyId, active: StockLotStatus.ACTIVE })
      .andWhere('l.expiryDate IS NOT NULL AND l.expiryDate <= DATE_ADD(CURDATE(), INTERVAL :days DAY)', { days });
    if (query.locationId) qb.andWhere('l.locationId = :locationId', { locationId: query.locationId });
    qb.orderBy('l.expiryDate', 'ASC');
    return { data: await qb.getMany(), days };
  }

  // ============================================================
  // INTERNES (partagés, prennent un EntityManager)
  // ============================================================
  private async ensureLocation(m: EntityManager, companyId: string, locationId: string, lang: string) {
    const loc = await m.getRepository(StockLocation).findOne({ where: { id: locationId, companyId } });
    if (!loc) throw new NotFoundException(this.t('inventory.location_not_found', lang));
    return loc;
  }

  private async bumpStockItem(m: EntityManager, companyId: string, locationId: string, productId: string, delta: number, allowNegative = false, lang = 'fr'): Promise<number> {
    const repo = m.getRepository(StockItem);
    let item = await repo.createQueryBuilder('s')
      .where('s.companyId = :companyId AND s.locationId = :locationId AND s.productId = :productId', { companyId, locationId, productId })
      .setLock('pessimistic_write').getOne();
    if (!item) item = repo.create({ companyId, locationId, productId, quantity: 0, reserved: 0, minQuantity: 0 });
    const next = r3((item.quantity || 0) + delta);
    if (next < 0 && !allowNegative) throw new BadRequestException(this.t('inventory.insufficient_stock', lang));
    item.quantity = next;
    await repo.save(item);
    return next;
  }

  private async writeMovement(m: EntityManager, data: Partial<StockMovement>) {
    const repo = m.getRepository(StockMovement);
    await repo.save(repo.create(data));
  }
}
