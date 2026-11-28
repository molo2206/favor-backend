import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import * as crypto from 'crypto';
import { I18nService } from 'src/libs/common/src';
import { InventoryService } from 'src/inventory/inventory.service';
import { CompanyCapabilitiesService } from 'src/inventory/capabilities/company-capabilities.service';
import { StockItem } from 'src/inventory/entities/stock-item.entity';
import { StockLocation } from 'src/inventory/entities/stock-location.entity';
import { ProductPharmaMeta } from 'src/inventory/entities/product-pharma-meta.entity';
import { StockMovementSource } from 'src/inventory/enums/inventory.enum';
import { Product } from 'src/products/entities/product.entity';
import { ListingType } from 'src/products/enum/listing-type.enum';
import { ProductStatus } from 'src/products/enum/product.status.enum';
import { ProductService } from 'src/products/products.service';
import { PosTerminal } from './entities/pos-terminal.entity';
import { PosSession } from './entities/pos-session.entity';
import { PosSale } from './entities/pos-sale.entity';
import { PosSaleItem } from './entities/pos-sale-item.entity';
import { PosSalePayment } from './entities/pos-sale-payment.entity';
import { PosPaymentMethod, PosPaymentStatus, PosSaleSource, PosSaleStatus, PosSessionStatus } from './enums/pos.enum';
import {
  AddPaymentDto, CatalogQueryDto, CloseSessionDto, CreateSaleDto, CreateTerminalDto,
  CreditsQueryDto, OpenSessionDto, SalesQueryDto, UpdateTerminalConfigDto, UpsertProductDto,
} from './dto/pos.dto';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const r3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly inventory: InventoryService,
    private readonly capabilities: CompanyCapabilitiesService,
    private readonly products: ProductService,
  ) {}

  private t(key: string, lang: string, args?: any) {
    return this.i18n.translate(key, lang, args);
  }

  private async assertPos(companyId: string, lang: string) {
    const caps = await this.capabilities.forCompany(companyId);
    if (!caps.hasPOS) throw new ForbiddenException({ code: 'pos.not_enabled_for_type', message: this.t('pos.not_enabled_for_type', lang) });
    return caps;
  }

  // ============================================================
  // TERMINAUX
  // ============================================================
  async createTerminal(companyId: string, dto: CreateTerminalDto, lang: string) {
    await this.assertPos(companyId, lang);
    const repo = this.dataSource.getRepository(PosTerminal);
    if (await repo.findOne({ where: { companyId, code: dto.code } })) throw new BadRequestException({ code: 'pos.terminal_code_taken', message: this.t('pos.terminal_code_taken', lang) });
    return repo.save(repo.create({
      companyId, branchId: dto.branchId ?? null,
      locationId: dto.locationId ?? (await this.inventory.defaultSaleLocationId(companyId)),
      name: dto.name, code: dto.code, config: dto.config ?? null,
      offlineEnabled: dto.offlineEnabled ?? true, lastSyncSeq: 0, isActive: true,
    }));
  }

  async updateTerminal(companyId: string, terminalId: string, dto: UpdateTerminalConfigDto, lang: string) {
    const repo = this.dataSource.getRepository(PosTerminal);
    const term = await repo.findOne({ where: { id: terminalId, companyId } });
    if (!term) throw new NotFoundException({ code: 'pos.terminal_not_found', message: this.t('pos.terminal_not_found', lang) });
    if (dto.name !== undefined) term.name = dto.name;
    if (dto.locationId !== undefined) term.locationId = dto.locationId;
    if (dto.offlineEnabled !== undefined) term.offlineEnabled = dto.offlineEnabled;
    if (dto.isActive !== undefined) term.isActive = dto.isActive;
    if (dto.config !== undefined) term.config = { ...(term.config || {}), ...dto.config };
    return repo.save(term);
  }

  /**
   * ✅ Chaque caisse avec sa session ouverte (pour la reprendre au lieu d'en rouvrir une)
   *    et son emplacement de stock (nom affiché dans les applis).
   */
  async listTerminals(companyId: string, lang: string) {
    await this.assertPos(companyId, lang);
    const terminals = await this.dataSource.getRepository(PosTerminal).find({ where: { companyId }, order: { name: 'ASC' } });
    if (!terminals.length) return [];

    const termIds = terminals.map((t) => t.id);
    const openSessions = await this.dataSource.getRepository(PosSession).find({
      where: { companyId, terminalId: In(termIds), status: PosSessionStatus.OPEN },
      order: { openedAt: 'DESC' },
    });
    const sessionByTerminal = new Map<string, PosSession>();
    for (const sess of openSessions) if (!sessionByTerminal.has(sess.terminalId)) sessionByTerminal.set(sess.terminalId, sess);

    const locIds = [...new Set(terminals.map((t) => t.locationId).filter((x): x is string => !!x))];
    const locations = locIds.length
      ? await this.dataSource.getRepository(StockLocation).find({ where: { id: In(locIds), companyId } })
      : [];
    const locById = new Map<string, StockLocation>(locations.map((l: StockLocation) => [l.id, l] as [string, StockLocation]));

    return terminals.map((t) => {
      const sess = sessionByTerminal.get(t.id);
      const loc = t.locationId ? locById.get(t.locationId) : undefined;
      return {
        ...t,
        openSessionId: sess?.id ?? null,
        openSession: sess
          ? { id: sess.id, openedAt: sess.openedAt, openingCash: Number(sess.openingCash) || 0, openedById: sess.openedById }
          : null,
        location: loc ? { id: loc.id, name: loc.name } : null,
      };
    });
  }

  // ============================================================
  // SESSIONS
  // ============================================================
  async openSession(companyId: string, dto: OpenSessionDto, userId: string, lang: string) {
    await this.assertPos(companyId, lang);
    const repo = this.dataSource.getRepository(PosSession);
    const term = await this.dataSource.getRepository(PosTerminal).findOne({ where: { id: dto.terminalId, companyId } });
    if (!term) throw new NotFoundException({ code: 'pos.terminal_not_found', message: this.t('pos.terminal_not_found', lang) });
    if (await repo.findOne({ where: { terminalId: dto.terminalId, status: PosSessionStatus.OPEN } })) throw new BadRequestException({ code: 'pos.session_already_open', message: this.t('pos.session_already_open', lang) });
    return repo.save(repo.create({
      companyId, terminalId: dto.terminalId, status: PosSessionStatus.OPEN,
      openedById: userId, openingCash: r2(dto.openingCash || 0), currency: dto.currency || 'USD', totalSales: 0, salesCount: 0,
    }));
  }

  async closeSession(companyId: string, sessionId: string, dto: CloseSessionDto, userId: string, lang: string) {
    const repo = this.dataSource.getRepository(PosSession);
    const session = await repo.findOne({ where: { id: sessionId, companyId } });
    if (!session) throw new NotFoundException({ code: 'pos.session_not_found', message: this.t('pos.session_not_found', lang) });
    if (session.status === PosSessionStatus.CLOSED) throw new BadRequestException({ code: 'pos.session_already_closed', message: this.t('pos.session_already_closed', lang) });

    // Théorique = fond + RÈGLEMENTS espèces encaissés durant la session
    const cashRow = await this.dataSource.getRepository(PosSalePayment).createQueryBuilder('p')
      .innerJoin(PosSale, 's', 's.id = p.saleId')
      .select('COALESCE(SUM(p.amount),0)', 'cash')
      .where('s.sessionId = :sessionId AND s.status = :paid AND p.method = :cash', { sessionId, paid: PosSaleStatus.PAID, cash: PosPaymentMethod.CASH })
      .getRawOne();
    const expected = r2(Number(session.openingCash) + Number(cashRow?.cash || 0));
    session.status = PosSessionStatus.CLOSED;
    session.closedById = userId;
    session.closedAt = new Date();
    session.expectedCash = expected;
    session.countedCash = r2(dto.countedCash);
    session.cashDifference = r2(dto.countedCash - expected);
    return repo.save(session);
  }

  async sessionSummary(companyId: string, sessionId: string, lang: string) {
    const session = await this.dataSource.getRepository(PosSession).findOne({ where: { id: sessionId, companyId } });
    if (!session) throw new NotFoundException({ code: 'pos.session_not_found', message: this.t('pos.session_not_found', lang) });
    const byMethod = await this.dataSource.getRepository(PosSalePayment).createQueryBuilder('p')
      .innerJoin(PosSale, 's', 's.id = p.saleId')
      .select('p.method', 'method').addSelect('COUNT(*)', 'count').addSelect('COALESCE(SUM(p.amount),0)', 'total')
      .where('s.sessionId = :sessionId AND s.status = :paid', { sessionId, paid: PosSaleStatus.PAID })
      .groupBy('p.method').getRawMany();
    const credit = await this.dataSource.getRepository(PosSale).createQueryBuilder('s')
      .select('COALESCE(SUM(s.amountDue),0)', 'due')
      .where('s.sessionId = :sessionId AND s.status = :paid AND s.amountDue > 0', { sessionId, paid: PosSaleStatus.PAID })
      .getRawOne();
    // ✅ Totaux au premier niveau et nombres convertis (le SQL brut renvoie des chaînes)
    return {
      session,
      byMethod: byMethod.map((b: any) => ({ method: b.method, count: Number(b.count) || 0, total: Number(b.total) || 0 })),
      creditOutstanding: Number(credit?.due || 0),
      totalSales: Number(session.totalSales) || 0,
      salesCount: Number(session.salesCount) || 0,
      openingCash: Number(session.openingCash) || 0,
      expectedCash: session.expectedCash != null ? Number(session.expectedCash) : null,
      countedCash: session.countedCash != null ? Number(session.countedCash) : null,
      cashDifference: session.cashDifference != null ? Number(session.cashDifference) : null,
      status: session.status,
    };
  }

  // ============================================================
  // VENTES (+ paiement crédit / partiel / multiple)
  // ============================================================
  async createSale(companyId: string, dto: CreateSaleDto, userId: string, lang: string, source: PosSaleSource = PosSaleSource.ONLINE) {
    const caps = await this.assertPos(companyId, lang);

    // Idempotence offline
    if (dto.clientOpId) {
      const session = await this.dataSource.getRepository(PosSession).findOne({ where: { id: dto.sessionId, companyId } });
      if (session) {
        const existing = await this.dataSource.getRepository(PosSale).findOne({ where: { terminalId: session.terminalId, clientOpId: dto.clientOpId } });
        if (existing) return { message: this.t('pos.sale_already_recorded', lang), sale: existing, duplicated: true };
      }
    }

    return this.dataSource.transaction(async (m) => {
      const session = await m.getRepository(PosSession).findOne({ where: { id: dto.sessionId, companyId } });
      if (!session) throw new NotFoundException({ code: 'pos.session_not_found', message: this.t('pos.session_not_found', lang) });
      if (session.status !== PosSessionStatus.OPEN) throw new BadRequestException({ code: 'pos.session_not_open', message: this.t('pos.session_not_open', lang) });
      const term = await m.getRepository(PosTerminal).findOne({ where: { id: session.terminalId, companyId } });
      if (!term) throw new NotFoundException({ code: 'pos.terminal_not_found', message: this.t('pos.terminal_not_found', lang) });

      // Totaux
      let subtotal = 0;
      for (const it of dto.items) subtotal = r2(subtotal + Number(it.unitPrice) * Number(it.quantity));
      const discount = r2(dto.discount || 0);
      const tax = r2(dto.tax || 0);
      const total = r2(subtotal - discount + tax);
      if (total < 0) throw new BadRequestException({ code: 'pos.invalid_total', message: this.t('pos.invalid_total', lang) });

      // Règlements
      const payments = (dto.payments?.length ? dto.payments : (dto.onCredit ? [] : [{ method: dto.paymentMethod ?? PosPaymentMethod.CASH, amount: total }]));
      const paidRaw = r2(payments.reduce((s, p) => s + Number(p.amount || 0), 0));
      const amountPaid = Math.min(paidRaw, total); // surplus = monnaie rendue (non dû)
      const amountDue = r2(Math.max(0, total - amountPaid));
      const paymentStatus: PosPaymentStatus =
        amountDue <= 0 ? PosPaymentStatus.PAID :
        amountPaid > 0 ? PosPaymentStatus.PARTIAL :
        (dto.onCredit ? PosPaymentStatus.CREDIT : PosPaymentStatus.UNPAID);
      // Un reste dû impose un client identifié
      if (paymentStatus !== PosPaymentStatus.PAID && !(dto.customerId || dto.customerName || dto.customerPhone)) {
        throw new BadRequestException({ code: 'pos.customer_required_for_credit', message: this.t('pos.customer_required_for_credit', lang) });
      }
      const primaryMethod = payments.length === 1 ? payments[0].method : (payments.length ? PosPaymentMethod.OTHER : PosPaymentMethod.OTHER);

      const number = `${term.code}-${Date.now().toString().slice(-8)}`;
      const sale = await m.getRepository(PosSale).save(m.getRepository(PosSale).create({
        companyId, terminalId: session.terminalId, sessionId: session.id, number,
        customerId: dto.customerId ?? null, customerName: dto.customerName ?? null, customerPhone: dto.customerPhone ?? null,
        subtotal, discount, tax, total, currency: dto.currency || session.currency || 'USD',
        paymentMethod: primaryMethod, status: PosSaleStatus.PAID,
        amountPaid: r2(amountPaid), amountDue, paymentStatus,
        source, hasPrescription: !!dto.hasPrescription, clientOpId: dto.clientOpId ?? null,
        cashierId: userId, soldAt: dto.soldAt ? new Date(dto.soldAt) : new Date(),
      }));

      // Lignes + sorties de stock (même transaction)
      for (const it of dto.items) {
        const locationId = it.locationId || term.locationId || (await this.inventory.defaultSaleLocationId(companyId));
        if (!locationId) throw new BadRequestException({ code: 'pos.no_location', message: this.t('pos.no_location', lang) });
        await m.getRepository(PosSaleItem).save(m.getRepository(PosSaleItem).create({
          saleId: sale.id, productId: it.productId, locationId,
          productName: it.productName || it.productId, unitPrice: r2(it.unitPrice),
          quantity: r3(it.quantity), lineTotal: r2(Number(it.unitPrice) * Number(it.quantity)),
        }));
        await this.inventory.consumeInTx(
          m, companyId,
          { productId: it.productId, locationId, quantity: it.quantity, hasPrescription: dto.hasPrescription },
          caps, lang,
          { source: StockMovementSource.POS, reference: number, performedById: userId, hasPrescription: dto.hasPrescription },
        );
      }

      // Enregistrer les règlements
      for (const p of payments) {
        await m.getRepository(PosSalePayment).save(m.getRepository(PosSalePayment).create({
          companyId, saleId: sale.id, method: p.method, amount: r2(p.amount),
          reference: (p as any).reference ?? null, paidById: userId, source, clientOpId: (p as any).clientOpId ?? null,
        }));
      }

      // Cumul session
      session.totalSales = r2(Number(session.totalSales) + total);
      session.salesCount = Number(session.salesCount) + 1;
      await m.getRepository(PosSession).save(session);

      const full = await m.getRepository(PosSale).findOne({ where: { id: sale.id }, relations: ['items'] });
      const pays = await m.getRepository(PosSalePayment).find({ where: { saleId: sale.id } });
      return { message: this.t('pos.sale_recorded', lang), sale: { ...(full as any), payments: pays } };
    });
  }

  /** Ajouter un règlement à une vente existante (solder un crédit / un reste dû) */
  async addPayment(companyId: string, saleId: string, dto: AddPaymentDto, userId: string, lang: string, source: PosSaleSource = PosSaleSource.ONLINE) {
    await this.assertPos(companyId, lang);

    // Idempotence
    if (dto.clientOpId) {
      const ex = await this.dataSource.getRepository(PosSalePayment).findOne({ where: { saleId, clientOpId: dto.clientOpId } });
      if (ex) {
        const s = await this.dataSource.getRepository(PosSale).findOne({ where: { id: saleId, companyId } });
        return { message: this.t('pos.payment_already_recorded', lang), sale: s, duplicated: true };
      }
    }

    return this.dataSource.transaction(async (m) => {
      const sale = await m.getRepository(PosSale).createQueryBuilder('s')
        .where('s.id = :saleId AND s.companyId = :companyId', { saleId, companyId })
        .setLock('pessimistic_write').getOne();
      if (!sale) throw new NotFoundException({ code: 'pos.sale_not_found', message: this.t('pos.sale_not_found', lang) });
      if (sale.status === PosSaleStatus.VOID) throw new BadRequestException({ code: 'pos.sale_void', message: this.t('pos.sale_void', lang) });
      if (Number(sale.amountDue) <= 0) throw new BadRequestException({ code: 'pos.already_settled', message: this.t('pos.already_settled', lang) });

      const amount = Math.min(r2(dto.amount), Number(sale.amountDue));
      if (amount <= 0) throw new BadRequestException({ code: 'pos.invalid_amount', message: this.t('pos.invalid_amount', lang) });

      await m.getRepository(PosSalePayment).save(m.getRepository(PosSalePayment).create({
        companyId, saleId: sale.id, method: dto.method, amount, reference: dto.reference ?? null,
        paidById: userId, source, clientOpId: dto.clientOpId ?? null,
      }));

      sale.amountPaid = r2(Number(sale.amountPaid) + amount);
      sale.amountDue = r2(Math.max(0, Number(sale.total) - Number(sale.amountPaid)));
      sale.paymentStatus = sale.amountDue <= 0 ? PosPaymentStatus.PAID : PosPaymentStatus.PARTIAL;
      await m.getRepository(PosSale).save(sale);
      return { message: this.t('pos.payment_recorded', lang), sale };
    });
  }

  async listSales(companyId: string, query: SalesQueryDto, lang: string) {
    await this.assertPos(companyId, lang);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const qb = this.dataSource.getRepository(PosSale).createQueryBuilder('s')
      .leftJoinAndSelect('s.items', 'items')
      .where('s.companyId = :companyId', { companyId });
    if (query.sessionId) qb.andWhere('s.sessionId = :sessionId', { sessionId: query.sessionId });
    if (query.terminalId) qb.andWhere('s.terminalId = :terminalId', { terminalId: query.terminalId });
    qb.orderBy('s.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  /** Ventes avec reste dû (crédits clients / créances) */
  async listCredits(companyId: string, query: CreditsQueryDto, lang: string) {
    await this.assertPos(companyId, lang);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const qb = this.dataSource.getRepository(PosSale).createQueryBuilder('s')
      .where('s.companyId = :companyId AND s.status = :paid AND s.amountDue > 0', { companyId, paid: PosSaleStatus.PAID });
    if (query.customerId) qb.andWhere('s.customerId = :cid', { cid: query.customerId });
    if (query.customerPhone) qb.andWhere('s.customerPhone = :cph', { cph: query.customerPhone });
    qb.orderBy('s.createdAt', 'ASC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    const sumRow = await this.dataSource.getRepository(PosSale).createQueryBuilder('s')
      .select('COALESCE(SUM(s.amountDue),0)', 'due')
      .where('s.companyId = :companyId AND s.status = :paid AND s.amountDue > 0', { companyId, paid: PosSaleStatus.PAID })
      .getRawOne();
    return { data, total, page, limit, totalOutstanding: Number(sumRow?.due || 0) };
  }

  // ============================================================
  // CATALOGUE PRODUITS (pour la caisse hors-ligne)
  // ============================================================
  async catalog(companyId: string, query: CatalogQueryDto, lang: string) {
    // ✅ Pris AVANT les lectures : un changement fait pendant la requête sera revu au prochain updatedSince
    const serverTime = new Date().toISOString();
    await this.assertPos(companyId, lang);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 200));
    const qb = this.dataSource.getRepository(Product).createQueryBuilder('p')
      .where('p.companyId = :companyId AND p.listingType = :lt', { companyId, lt: ListingType.PRODUCT });
    if (query.updatedSince) {
      const since = new Date(query.updatedSince);
      if (isNaN(since.getTime())) {
        throw new BadRequestException({ code: 'pos.invalid_updated_since', message: this.t('pos.invalid_updated_since', lang) });
      }
      // ✅ Produit modifié OU stock modifié (vente, réception…) depuis la dernière synchro
      qb.andWhere(
        '(p.updatedAt > :since OR p.id IN (SELECT si.productId COLLATE utf8mb4_unicode_ci FROM stock_items si WHERE si.companyId = :companyId AND si.updatedAt > :since))',
        { since, companyId },
      );
    }
    if (query.search) qb.andWhere('p.name LIKE :s', { s: `%${query.search}%` });
    qb.orderBy('p.updatedAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [rows, total] = await qb.getManyAndCount();

    const ids = rows.map((r) => r.id);
    const stockMap = new Map<string, number>();
    const pharmaMap = new Map<string, ProductPharmaMeta>();
    if (ids.length) {
      const stocks = await this.dataSource.getRepository(StockItem).createQueryBuilder('s')
        .select('s.productId', 'productId').addSelect('COALESCE(SUM(s.quantity),0)', 'qty')
        .where('s.companyId = :companyId AND s.productId IN (:...ids)', { companyId, ids })
        // ✅ Emplacement de la caisse si fourni, sinon total toutes zones
        .andWhere(query.locationId ? 's.locationId = :locationId' : '1=1', query.locationId ? { locationId: query.locationId } : {})
        .groupBy('s.productId').getRawMany();
      for (const s of stocks) stockMap.set(s.productId, Number(s.qty));
      const metas = await this.dataSource.getRepository(ProductPharmaMeta).createQueryBuilder('m')
        .where('m.productId IN (:...ids)', { ids }).getMany();
      for (const mm of metas) pharmaMap.set(mm.productId, mm);
    }

    const data = rows.map((p: any) => {
      const meta = pharmaMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        price: Number(p.price) || 0,
        detailPrice: p.detail != null ? Number(p.detail) : null,
        image: p.image ?? null,
        status: p.status,
        stock: stockMap.get(p.id) ?? 0,
        requiresPrescription: !!meta?.requiresPrescription,
        isControlled: !!meta?.isControlled,
        dci: meta?.dci ?? null,
        dosage: meta?.dosage ?? null,
        unitsPerPack: meta?.unitsPerPack ?? null,
        updatedAt: p.updatedAt,
      };
    });
    // La caisse garde ce timestamp et le renvoie en `updatedSince` à la prochaine synchro
    return { data, total, page, limit, serverTime };
  }

  // ============================================================
  // PRODUITS (création/màj depuis la caisse, y compris hors-ligne)
  // ============================================================
  async upsertProduct(companyId: string, dto: UpsertProductDto, userId: string, lang: string) {
    const caps = await this.assertPos(companyId, lang);
    if (!dto.name || !dto.name.trim()) throw new BadRequestException({ code: 'pos.product_name_required', message: this.t('pos.product_name_required', lang) });
    const repo = this.dataSource.getRepository(Product);
    const id = (dto.id || '').trim() || crypto.randomUUID();

    // Produit existant (quelle que soit la société) ?
    const owned = await repo.createQueryBuilder('p').where('p.id = :id AND p.companyId = :companyId', { id, companyId }).getOne();
    if (!owned) {
      const usedElsewhere = await repo.createQueryBuilder('p').where('p.id = :id', { id }).getCount();
      if (usedElsewhere) throw new BadRequestException({ code: 'pos.product_not_found', message: this.t('pos.product_not_found', lang) }); // id déjà pris par une autre société
    }
    const isNew = !owned;
    let saved: Product;

    if (isNew) {
      // ✅ Création : on suit la MÊME logique que la création normale (slug, type d'entreprise,
      //    companyActivity, min_quantity, catégorie/marque) via ProductService.createForPos.
      saved = await this.products.createForPos(
        companyId,
        {
          id,
          name: dto.name,
          price: dto.price ?? undefined,
          detailPrice: dto.detailPrice ?? undefined,
          image: dto.image ?? undefined,
          description: dto.description ?? undefined,
          categoryId: dto.categoryId,
          brandId: dto.brandId,
          min_quantity: (dto as any).min_quantity,
        },
        lang,
      );
    } else {
      // ✅ Mise à jour d'un produit existant de l'entreprise
      const product: any = owned;
      product.name = dto.name.trim();
      if (dto.price != null) product.price = dto.price;
      if (dto.detailPrice != null) product.detail = dto.detailPrice;
      if (dto.image !== undefined) product.image = dto.image ?? null;
      if (dto.description !== undefined) product.description = dto.description ?? null;
      product.listingType = ListingType.PRODUCT;
      if (dto.categoryId) product.category = { id: dto.categoryId };
      if (dto.brandId) product.brand = { id: dto.brandId };
      saved = await repo.save(product);
    }

    // Métadonnées pharmacie
    if (dto.requiresPrescription != null || dto.isControlled != null || dto.dci !== undefined || dto.dosage !== undefined || dto.unitsPerPack !== undefined) {
      const metaRepo = this.dataSource.getRepository(ProductPharmaMeta);
      const meta = (await metaRepo.findOne({ where: { productId: saved.id } })) || metaRepo.create({ productId: saved.id, requiresPrescription: false, isControlled: false });
      if (dto.requiresPrescription != null) meta.requiresPrescription = dto.requiresPrescription;
      if (dto.isControlled != null) meta.isControlled = dto.isControlled;
      if (dto.dci !== undefined) meta.dci = dto.dci ?? null;
      if (dto.dosage !== undefined) meta.dosage = dto.dosage ?? null;
      if (dto.unitsPerPack !== undefined) meta.unitsPerPack = dto.unitsPerPack ?? null;
      await metaRepo.save(meta);
    }

    // Stock initial (types SANS lot ; pour la pharmacie, passer par une entrée STOCK_IN avec lot)
    if (isNew && dto.initialStock && dto.initialStock > 0 && caps.hasInventory && !caps.tracksLots) {
      const locationId = dto.locationId || (await this.inventory.defaultSaleLocationId(companyId));
      if (locationId) {
        await this.inventory.receive(companyId, { productId: saved.id, locationId, quantity: dto.initialStock }, lang, userId);
      }
    }
    return { message: this.t('pos.product_recorded', lang), product: { id: saved.id, name: saved.name }, created: isNew };
  }

  async getTerminal(companyId: string, terminalId: string, lang: string): Promise<PosTerminal> {
    const term = await this.dataSource.getRepository(PosTerminal).findOne({ where: { id: terminalId, companyId } });
    if (!term) throw new NotFoundException({ code: 'pos.terminal_not_found', message: this.t('pos.terminal_not_found', lang) });
    return term;
  }
}
