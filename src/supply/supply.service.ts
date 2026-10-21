import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Not } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { OrderEntity } from 'src/order/entities/order.entity';
import { SubOrderEntity } from 'src/sub-order/entities/sub-order.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';
import { PackageDetails } from 'src/shipment/entity/package-details.entity';
import { ShipmentTracking } from 'src/shipment/entity/shipment_tracking.entity';
import { ShipmentStatus } from 'src/shipment/enum/shipment.dto';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { LtaShipmentEntity } from 'src/shipment/Lta/entity/lta-shipment.entity';
import { BranchParcelStock } from 'src/branch-stock/entities/branch-parcel-stock.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { TrackingNumberUtil } from 'src/users/utility/helpers/tracking-number.util';
import { GeneratePin } from 'src/users/utility/helpers/GeneratePin.util';
import { Supply } from './entities/supply.entity';
import { SupplyHistory } from './entities/supply-history.entity';
import { SupplyEventType, SupplyStatus } from './enums/supply.enum';
import { SupplyHistoryService } from './supply-history.service';
import {
  CancelSupplyDto,
  ChangeSupplyStatusDto,
  ConvertToShipmentDto,
  CreateSupplyDto,
  CreateSupplyFromOrderDto,
  SupplyQueryDto,
  UpdateSupplyDto,
} from './dto/supply.dto';

@Injectable()
export class SupplyService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly history: SupplyHistoryService,
  ) { }

  private t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params);
  }

  private isAdmin(user: UserEntity): boolean {
    return user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
  }

  /** Entreprises auxquelles l'utilisateur est rattaché */
  private async userCompanyIds(user: UserEntity): Promise<string[]> {
    if (!user?.id) return [];
    const rows: { companyId: string }[] = await this.dataSource.query(
      'SELECT DISTINCT `companyId` FROM `user_has_company` WHERE `userId` = ?',
      [user.id],
    );
    return rows.map((r) => r.companyId).filter(Boolean);
  }

  private async assertAccess(user: UserEntity, supply: Supply, lang: string): Promise<void> {
    if (this.isAdmin(user)) return;
    if (supply.customerId && supply.customerId === user?.id) return;
    const companies = await this.userCompanyIds(user);
    if (supply.companyId && companies.includes(supply.companyId)) return;
    throw new ForbiddenException(this.t('supply.forbidden', lang));
  }

  private async generateReference(m: EntityManager): Promise<string> {
    const d = new Date();
    const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    for (let i = 0; i < 20; i++) {
      const ref = `SUP-${day}-${Math.floor(10000 + Math.random() * 90000)}`;
      const exists = await m.count(Supply, { where: { reference: ref } });
      if (!exists) return ref;
    }
    return `SUP-${day}-${Date.now()}`;
  }

  private async generateTrackingNumber(m: EntityManager): Promise<string> {
    for (let i = 0; i < 30; i++) {
      const tn = TrackingNumberUtil.generate();
      const exists = await m.count(Shipment, { where: { trackingNumber: tn } });
      if (!exists) return tn;
    }
    return `${Date.now()}`;
  }

  private async checkBranch(m: EntityManager, id: string | undefined | null, lang: string): Promise<BranchEntity | null> {
    if (!id) return null;
    const branch = await m.findOne(BranchEntity, { where: { id }, relations: ['city'] });
    if (!branch || branch.deleted) throw new NotFoundException(this.t('supply.branch_not_found', lang));
    return branch;
  }

  // ============================================================
  // CRÉATION
  // ============================================================

  private async createOne(
    m: EntityManager,
    order: OrderEntity,
    subOrder: SubOrderEntity | null,
    dto: CreateSupplyFromOrderDto,
    user: UserEntity,
  ): Promise<Supply> {
    const items = subOrder ? subOrder.items ?? [] : order.orderItems ?? [];
    const itemsCount = items.reduce((s, it: any) => s + Number(it.quantity || 0), 0);
    const total = subOrder ? Number(subOrder.totalAmount || 0) : Number(order.totalAmount || 0);

    const supply = await m.save(
      Supply,
      m.create(Supply, {
        reference: await this.generateReference(m),
        orderId: order.id,
        subOrderId: subOrder?.id ?? null,
        companyId: subOrder?.company?.id ?? (items[0] as any)?.product?.company?.id ?? null,
        customerId: (order as any).userId ?? order.user?.id ?? null,
        originBranchId: dto.originBranchId ?? null,
        destinationBranchId: dto.destinationBranchId ?? null,
        status: SupplyStatus.PENDING,
        invoiceNumber: subOrder?.invoiceNumber || order.invoiceNumber || null,
        totalAmount: total,
        currency: order.currency ?? null,
        itemsCount,
        notes: dto.notes ?? null,
        createdById: user?.id ?? null,
      }),
    );

    await this.history.record(
      supply.id,
      {
        eventType: SupplyEventType.SUPPLY_CREATED,
        description: `Supply ${supply.reference} créé depuis la commande ${order.invoiceNumber ?? order.id}${subOrder?.company?.companyName ? ` (${subOrder.company.companyName})` : ''}`,
        toStatus: SupplyStatus.PENDING,
        orderId: order.id,
        performedById: user?.id ?? null,
        payload: { subOrderId: subOrder?.id ?? null, itemsCount, totalAmount: total, orderStatus: order.status },
      },
      m,
    );
    return supply;
  }

  /** Crée un Supply par vendeur (sous-commande) pour toute la commande */
  async createFromOrder(orderId: string, dto: CreateSupplyFromOrderDto, user: UserEntity, lang: string) {
    const created = await this.dataSource.transaction(async (m) => {
      await this.checkBranch(m, dto.originBranchId, lang);
      await this.checkBranch(m, dto.destinationBranchId, lang);

      const order = await m.findOne(OrderEntity, {
        where: { id: orderId },
        relations: ['user', 'subOrders', 'subOrders.items', 'subOrders.items.product', 'orderItems', 'orderItems.product', 'orderItems.product.company'],
      });
      if (!order) throw new NotFoundException(this.t('supply.order_not_found', lang));

      const existing = await m.find(Supply, { where: { orderId, status: Not(SupplyStatus.CANCELLED) } });
      const out: Supply[] = [];

      if (order.subOrders?.length) {
        for (const sub of order.subOrders) {
          if (existing.some((s) => s.subOrderId === sub.id)) continue;
          out.push(await this.createOne(m, order, sub, dto, user));
        }
      } else if (!existing.length) {
        out.push(await this.createOne(m, order, null, dto, user));
      }
      return out;
    });

    if (!created.length) {
      throw new ConflictException(this.t('supply.already_exists', lang));
    }
    return { message: this.t('supply.created', lang, { count: created.length }), data: created };
  }

  /** Crée un Supply pour une sous-commande précise (ou une commande sans sous-commande) */
  async create(dto: CreateSupplyDto, user: UserEntity, lang: string) {
    if (!dto.subOrderId && !dto.orderId) throw new BadRequestException(this.t('supply.order_required', lang));

    const supply = await this.dataSource.transaction(async (m) => {
      await this.checkBranch(m, dto.originBranchId, lang);
      await this.checkBranch(m, dto.destinationBranchId, lang);

      let subOrder: SubOrderEntity | null = null;
      let orderId = dto.orderId;
      if (dto.subOrderId) {
        subOrder = await m.findOne(SubOrderEntity, {
          where: { id: dto.subOrderId },
          relations: ['order', 'items', 'items.product'],
        });
        if (!subOrder) throw new NotFoundException(this.t('supply.order_not_found', lang));
        orderId = subOrder.order?.id;
        const dup = await m.count(Supply, { where: { subOrderId: subOrder.id, status: Not(SupplyStatus.CANCELLED) } });
        if (dup) throw new ConflictException(this.t('supply.already_exists', lang));
      }

      const order = await m.findOne(OrderEntity, {
        where: { id: orderId },
        relations: ['user', 'orderItems', 'orderItems.product', 'orderItems.product.company'],
      });
      if (!order) throw new NotFoundException(this.t('supply.order_not_found', lang));
      if (!subOrder) {
        const dup = await m.count(Supply, { where: { orderId: order.id, status: Not(SupplyStatus.CANCELLED) } });
        if (dup) throw new ConflictException(this.t('supply.already_exists', lang));
      }
      return this.createOne(m, order, subOrder, dto, user);
    });

    return { message: this.t('supply.created', lang, { count: 1 }), data: supply };
  }

  // ============================================================
  // COMMANDE → SHIPMENT
  // ============================================================

  async convertToShipment(supplyId: string, dto: ConvertToShipmentDto, user: UserEntity, lang: string) {
    const ref = await this.dataSource.manager.findOne(Supply, { where: { id: supplyId } });
    if (!ref) throw new NotFoundException(this.t('supply.not_found', lang));
    await this.assertAccess(user, ref, lang);

    const result = await this.dataSource.transaction(async (m) => {
      const supply = await m.findOne(Supply, { where: { id: supplyId }, lock: { mode: 'pessimistic_write' } });
      if (!supply) throw new NotFoundException(this.t('supply.not_found', lang));
      if (supply.status === SupplyStatus.CANCELLED) throw new BadRequestException(this.t('supply.cancelled', lang));
      if (supply.shipmentId) throw new ConflictException(this.t('supply.already_converted', lang));

      const order = await m.findOne(OrderEntity, {
        where: { id: supply.orderId },
        relations: ['user', 'addressUser', 'orderItems', 'orderItems.product'],
      });
      if (!order) throw new NotFoundException(this.t('supply.order_not_found', lang));
      const subOrder = supply.subOrderId
        ? await m.findOne(SubOrderEntity, { where: { id: supply.subOrderId }, relations: ['items', 'items.product'] })
        : null;
      const company = supply.companyId
        ? await m.findOne(CompanyEntity, { where: { id: supply.companyId } })
        : null;

      const origin = await this.checkBranch(m, dto.originBranchId ?? supply.originBranchId, lang);
      const destination = await this.checkBranch(m, dto.destinationBranchId ?? supply.destinationBranchId, lang);

      // Articles de la commande → description + nombre de pièces
      const items: any[] = subOrder ? subOrder.items ?? [] : order.orderItems ?? [];
      const description =
        dto.description?.trim() ||
        items
          .map((it) => `${it.quantity}× ${it.product?.name ?? 'Article'}${it.variationLabel ? ` (${it.variationLabel})` : ''}`)
          .join(', ')
          .slice(0, 2000) ||
        `Commande ${order.invoiceNumber ?? order.id}`;
      const pieces = dto.quantity ?? Math.max(1, items.reduce((s, it) => s + Number(it.quantity || 0), 0));

      const address: any = order.addressUser;
      const clientName = address ? `${address.firstName ?? ''} ${address.lastName ?? ''}`.trim() : order.user?.fullName;
      const clientPhone = address?.phone || order.user?.phone || order.whatsapp_number || null;
      const branchLabel = (b: BranchEntity | null) => (b ? `${b.name}${(b as any).city?.name ? ` (${(b as any).city.name})` : ''}` : undefined);

      const pickupEnabled = dto.pickupEnabled ?? true;
      const shippingEnabled = dto.shippingEnabled ?? true;
      const deliveryEnabled = dto.deliveryEnabled ?? false;
      const pickupPrice = Number(dto.pickupPrice ?? 0);
      const shippingPrice = Number(dto.shippingPrice ?? 0);
      const deliveryPrice = Number(dto.deliveryPrice ?? 0);

      const pkg = m.create(PackageDetails, {
        description,
        weight: dto.weight,
        dimensions: dto.dimensions,
        external_quantity: pieces,
        internal_quantity: pieces,
        value: dto.value ?? Number(supply.totalAmount || 0),
        fragile: dto.fragile ?? false,
      });

      const shipment = m.create(Shipment, {
        trackingNumber: await this.generateTrackingNumber(m),
        userId: supply.customerId ?? (order as any).userId ?? null,
        status: dto.status ?? ShipmentStatus.PENDING,
        pickupEnabled,
        shippingEnabled,
        deliveryEnabled,
        pickupFrom: dto.pickupFrom ?? company?.address ?? company?.companyName ?? undefined,
        pickupTo: dto.pickupTo ?? branchLabel(origin),
        pickupContactName: company?.companyName ?? undefined,
        pickupContactPhone: company?.phone ?? undefined,
        shippingFrom: dto.shippingFrom ?? branchLabel(origin),
        shippingTo: dto.shippingTo ?? branchLabel(destination),
        deliveryFrom: dto.deliveryFrom ?? (deliveryEnabled ? branchLabel(destination) : undefined),
        deliveryTo: dto.deliveryTo ?? (deliveryEnabled ? address?.address : undefined),
        deliveryContactName: deliveryEnabled ? clientName : undefined,
        deliveryContactPhone: deliveryEnabled ? clientPhone : undefined,
        deliveryAddressId: deliveryEnabled ? order.addressUserId ?? null : null,
        pickupCompanyId: dto.pickupCompanyId,
        shippingCompanyId: dto.shippingCompanyId,
        deliveryCompanyId: dto.deliveryCompanyId,
        pickupTransportTypeId: dto.pickupTransportTypeId,
        pickupPrice,
        shippingPrice,
        deliveryPrice,
        totalPrice: pickupPrice + shippingPrice + deliveryPrice,
        paymentMethod: dto.paymentMethod,
        isPaid: !!dto.isPaid,
        paid: !!dto.isPaid,
        clientName: clientName || undefined,
        clientPhone: clientPhone || undefined,
        fournisseurName: company?.companyName ?? undefined,
        fournisseurPhone: company?.phone ?? undefined,
        whatsapp_number: order.whatsapp_number ?? undefined,
        pin: dto.generatePin === false ? undefined : GeneratePin.generate(),
        package: pkg,
        // ✅ liens Supply
        orderId: order.id,
        subOrderId: supply.subOrderId ?? null,
        supplyId: supply.id,
      } as any) as unknown as Shipment;
      const saved = (await m.save(Shipment, shipment)) as Shipment;

      // Première ligne de tracking
      await m.save(
        ShipmentTracking,
        m.create(ShipmentTracking, {
          shipmentId: saved.id,
          shipment: { id: saved.id } as Shipment,
          status: saved.status,
          location: branchLabel(origin) ?? saved.pickupFrom ?? '',
          comment: `Créé depuis la commande ${order.invoiceNumber ?? order.id} (Supply ${supply.reference})${dto.note ? ` — ${dto.note}` : ''}`,
        }),
      );

      // Liens Supply → shipment
      supply.shipmentId = saved.id;
      if (origin) supply.originBranchId = origin.id;
      if (destination) supply.destinationBranchId = destination.id;
      await m.update(Supply, { id: supply.id }, {
        shipmentId: saved.id,
        originBranchId: supply.originBranchId ?? null,
        destinationBranchId: supply.destinationBranchId ?? null,
      });

      await this.history.record(
        supply.id,
        {
          eventType: SupplyEventType.SHIPMENT_CREATED,
          description: `Commande transformée en shipment ${saved.trackingNumber} (${pieces} pièce(s))`,
          orderId: order.id,
          shipmentId: saved.id,
          branchId: origin?.id ?? null,
          performedById: user?.id ?? null,
          payload: {
            trackingNumber: saved.trackingNumber,
            pieces,
            totalPrice: saved.totalPrice,
            pickupEnabled,
            shippingEnabled,
            deliveryEnabled,
            originBranchId: origin?.id ?? null,
            destinationBranchId: destination?.id ?? null,
          },
        },
        m,
      );
      await this.history.advanceStatus(supply, SupplyStatus.SHIPMENT_CREATED, `Shipment ${saved.trackingNumber} créé`, m, {
        shipmentId: saved.id,
        performedById: user?.id ?? null,
      });

      // LTA directe (l'historique « Ajouté à la LTA » est écrit automatiquement)
      if (dto.ltaId) {
        const lta = await m.findOne(LtaEntity, { where: { id: dto.ltaId } });
        if (!lta) throw new NotFoundException(this.t('supply.lta_not_found', lang));
        const position = await m.count(LtaShipmentEntity, { where: { ltaId: lta.id } });
        await m.save(
          LtaShipmentEntity,
          m.create(LtaShipmentEntity, { ltaId: lta.id, shipmentId: saved.id, position, isMaster: false }),
        );
      }

      return { supply, shipment: saved };
    });

    const shipment = await this.dataSource.manager.findOne(Shipment, {
      where: { id: result.shipment.id },
      relations: ['package', 'trackings', 'ltaShipments', 'ltaShipments.lta'],
    });
    return {
      message: this.t('supply.converted', lang, { tracking: result.shipment.trackingNumber }),
      data: { supply: await this.loadSupply(result.supply.id), shipment },
    };
  }

  // ============================================================
  // MISE À JOUR / STATUT / NOTES / ANNULATION
  // ============================================================

  async update(id: string, dto: UpdateSupplyDto, user: UserEntity, lang: string) {
    const supply = await this.dataSource.manager.findOne(Supply, { where: { id } });
    if (!supply) throw new NotFoundException(this.t('supply.not_found', lang));
    await this.assertAccess(user, supply, lang);
    await this.checkBranch(this.dataSource.manager, dto.originBranchId, lang);
    await this.checkBranch(this.dataSource.manager, dto.destinationBranchId, lang);

    const changes: string[] = [];
    if (dto.originBranchId !== undefined && dto.originBranchId !== supply.originBranchId) { supply.originBranchId = dto.originBranchId; changes.push('branche de départ'); }
    if (dto.destinationBranchId !== undefined && dto.destinationBranchId !== supply.destinationBranchId) { supply.destinationBranchId = dto.destinationBranchId; changes.push('branche de destination'); }
    if (dto.notes !== undefined) { supply.notes = dto.notes; changes.push('notes'); }
    await this.dataSource.manager.save(Supply, supply);
    if (changes.length) {
      await this.history.record(supply.id, {
        eventType: SupplyEventType.NOTE,
        description: `Modification : ${changes.join(', ')}`,
        orderId: supply.orderId,
        shipmentId: supply.shipmentId ?? null,
        performedById: user?.id ?? null,
      });
    }
    return { message: this.t('supply.updated', lang), data: await this.loadSupply(id) };
  }

  async changeStatus(id: string, dto: ChangeSupplyStatusDto, user: UserEntity, lang: string) {
    const supply = await this.dataSource.manager.findOne(Supply, { where: { id } });
    if (!supply) throw new NotFoundException(this.t('supply.not_found', lang));
    await this.assertAccess(user, supply, lang);
    const changed = await this.history.advanceStatus(
      supply,
      dto.status,
      dto.note || `Statut changé manuellement en ${dto.status}`,
      null,
      { performedById: user?.id ?? null },
    );
    if (!changed) {
      throw new BadRequestException(this.t('supply.invalid_transition', lang, { from: supply.status, to: dto.status }));
    }
    return { message: this.t('supply.status_changed', lang, { status: dto.status }), data: await this.loadSupply(id) };
  }

  async addNote(id: string, note: string, user: UserEntity, lang: string) {
    const supply = await this.dataSource.manager.findOne(Supply, { where: { id } });
    if (!supply) throw new NotFoundException(this.t('supply.not_found', lang));
    await this.assertAccess(user, supply, lang);
    await this.history.record(supply.id, {
      eventType: SupplyEventType.NOTE,
      description: note,
      orderId: supply.orderId,
      shipmentId: supply.shipmentId ?? null,
      performedById: user?.id ?? null,
    });
    return { message: this.t('supply.note_added', lang), data: await this.history_(id) };
  }

  async cancel(id: string, dto: CancelSupplyDto, user: UserEntity, lang: string) {
    const supply = await this.dataSource.manager.findOne(Supply, { where: { id } });
    if (!supply) throw new NotFoundException(this.t('supply.not_found', lang));
    await this.assertAccess(user, supply, lang);
    if ([SupplyStatus.COMPLETED, SupplyStatus.CANCELLED].includes(supply.status)) {
      throw new BadRequestException(this.t('supply.cannot_cancel', lang));
    }
    await this.history.advanceStatus(supply, SupplyStatus.CANCELLED, `Annulé : ${dto.reason}`, null, {
      performedById: user?.id ?? null,
    });
    return { message: this.t('supply.cancelled_ok', lang), data: await this.loadSupply(id) };
  }

  // ============================================================
  // CONSULTATION
  // ============================================================

  private async loadSupply(id: string) {
    return this.dataSource.manager.findOne(Supply, {
      where: { id },
      relations: ['order', 'subOrder', 'company', 'customer', 'shipment', 'shipment.package', 'originBranch', 'destinationBranch'],
    });
  }

  private async history_(supplyId: string): Promise<SupplyHistory[]> {
    return this.dataSource.manager
      .createQueryBuilder(SupplyHistory, 'h')
      .leftJoin('h.performedBy', 'performedBy')
      .addSelect(['performedBy.id', 'performedBy.fullName'])
      .where('h.supplyId = :supplyId', { supplyId })
      .orderBy('h.createdAt', 'ASC')
      .getMany();
  }

  async list(query: SupplyQueryDto, user: UserEntity, lang: string) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 20));
    const qb = this.dataSource.manager
      .createQueryBuilder(Supply, 's')
      .leftJoinAndSelect('s.company', 'company')
      .leftJoinAndSelect('s.shipment', 'shipment')
      .leftJoinAndSelect('s.originBranch', 'originBranch')
      .leftJoinAndSelect('s.destinationBranch', 'destinationBranch')
      .leftJoin('s.customer', 'customer')
      .addSelect(['customer.id', 'customer.fullName', 'customer.phone', 'customer.email']);

    if (!this.isAdmin(user)) {
      const companies = await this.userCompanyIds(user);
      qb.andWhere(
        new Brackets((w) => {
          w.where('s.customerId = :uid', { uid: user.id });
          if (companies.length) w.orWhere('s.companyId IN (:...companies)', { companies });
        }),
      );
    }
    if (query.status) qb.andWhere('s.status = :status', { status: query.status });
    if (query.companyId) qb.andWhere('s.companyId = :companyId', { companyId: query.companyId });
    if (query.orderId) qb.andWhere('s.orderId = :orderId', { orderId: query.orderId });
    if (query.shipmentId) qb.andWhere('s.shipmentId = :shipmentId', { shipmentId: query.shipmentId });
    if (query.branchId) {
      qb.andWhere('(s.originBranchId = :branchId OR s.destinationBranchId = :branchId)', { branchId: query.branchId });
    }
    if (query.search?.trim()) {
      const kw = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('LOWER(s.reference) LIKE :kw', { kw })
            .orWhere('LOWER(s.invoiceNumber) LIKE :kw', { kw })
            .orWhere('LOWER(shipment.trackingNumber) LIKE :kw', { kw })
            .orWhere('LOWER(customer.fullName) LIKE :kw', { kw })
            .orWhere('LOWER(company.companyName) LIKE :kw', { kw }),
        ),
      );
    }
    if (query.from) qb.andWhere('s.createdAt >= :from', { from: new Date(`${query.from}T00:00:00`) });
    if (query.to) qb.andWhere('s.createdAt <= :to', { to: new Date(`${query.to}T23:59:59.999`) });

    const [items, total] = await qb.orderBy('s.createdAt', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { message: this.t('supply.list', lang), data: new PaginatedResponseDto(items, total, page, limit) };
  }

  /** Détail complet : commande, shipment, tracking, LTA, stock en branche, historique */
  async findOne(id: string, user: UserEntity, lang: string) {
    const supply = await this.dataSource.manager.findOne(Supply, {
      where: { id },
      relations: [
        'order',
        'order.addressUser',
        'subOrder',
        'subOrder.items',
        'subOrder.items.product',
        'company',
        'customer',
        'originBranch',
        'destinationBranch',
        'shipment',
        'shipment.package',
        'shipment.trackings',
        'shipment.ltaShipments',
        'shipment.ltaShipments.lta',
        'shipment.ltaShipments.lta.tracking',
      ],
    });
    if (!supply) throw new NotFoundException(this.t('supply.not_found', lang));
    await this.assertAccess(user, supply, lang);

    const stocks = supply.shipmentId
      ? await this.dataSource.manager.find(BranchParcelStock, { where: { shipmentId: supply.shipmentId }, relations: ['branch'] })
      : [];

    return {
      message: this.t('supply.detail', lang),
      data: { ...supply, branchStocks: stocks, history: await this.history_(id) },
    };
  }

  async getHistory(id: string, user: UserEntity, lang: string) {
    const supply = await this.dataSource.manager.findOne(Supply, { where: { id } });
    if (!supply) throw new NotFoundException(this.t('supply.not_found', lang));
    await this.assertAccess(user, supply, lang);
    return { message: this.t('supply.history', lang), data: await this.history_(id) };
  }

  /** Chronologie complète d'une commande (tous ses Supply) */
  async orderTimeline(orderId: string, user: UserEntity, lang: string) {
    const supplies = await this.dataSource.manager.find(Supply, {
      where: { orderId },
      relations: ['shipment', 'company', 'originBranch', 'destinationBranch'],
      order: { createdAt: 'ASC' },
    });
    if (!supplies.length) throw new NotFoundException(this.t('supply.not_found', lang));
    for (const s of supplies) await this.assertAccess(user, s, lang);

    const events = await this.dataSource.manager
      .createQueryBuilder(SupplyHistory, 'h')
      .leftJoin('h.performedBy', 'performedBy')
      .addSelect(['performedBy.id', 'performedBy.fullName'])
      .where('h.supplyId IN (:...ids)', { ids: supplies.map((s) => s.id) })
      .orderBy('h.createdAt', 'ASC')
      .getMany();

    return { message: this.t('supply.timeline', lang), data: { orderId, supplies, events } };
  }

  /** Supply d'un shipment (id ou numéro de suivi) */
  async byShipment(key: string, user: UserEntity, lang: string) {
    const shipment = await this.dataSource.manager.findOne(Shipment, { where: [{ id: key }, { trackingNumber: key }] });
    if (!shipment) throw new NotFoundException(this.t('supply.shipment_not_found', lang));
    const supplies = await this.dataSource.manager.find(Supply, { where: { shipmentId: shipment.id } });
    if (!supplies.length) throw new NotFoundException(this.t('supply.not_found', lang));
    return this.findOne(supplies[0].id, user, lang);
  }

  /** Statistiques par statut */
  async stats(user: UserEntity, lang: string, companyId?: string) {
    const qb = this.dataSource.manager
      .createQueryBuilder(Supply, 's')
      .select('s.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('s.status');
    if (companyId) {
      if (!this.isAdmin(user) && !(await this.userCompanyIds(user)).includes(companyId)) {
        throw new ForbiddenException(this.t('supply.forbidden', lang));
      }
      qb.where('s.companyId = :companyId', { companyId });
    } else if (!this.isAdmin(user)) {
      const companies = await this.userCompanyIds(user);
      if (!companies.length) return { message: this.t('supply.stats', lang), data: [] };
      qb.where('s.companyId IN (:...companies)', { companies });
    }
    const rows = await qb.getRawMany();
    return { message: this.t('supply.stats', lang), data: rows.map((r) => ({ status: r.status, count: Number(r.count) })) };
  }
}
