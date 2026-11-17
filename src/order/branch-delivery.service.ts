import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { OrderEntity } from './entities/order.entity';
import { OrderDeliveryAssignment } from './entities/order-delivery-assignment.entity';
import { AssignmentStatus } from './enum/assignment-status.enum';
import { OrderStatus } from './enum/order.status.enum';
import { OrderDeliveryService } from './order-delivery.service';
import { OrderCallService } from './order-call.service';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { I18nService } from 'src/libs/common/src';
import { NotificationsService } from 'src/notification/notifications.service';
import { NotificationsGateway } from 'src/notification/notifications.gateway';
import { NotificationType } from 'src/notification/type/notification.type';

/** Une permission d'un livreur sur les commandes d'une branche */
export interface DelivererBranchRight {
  userId: string;
  fullName: string | null;
  phone: string | null;
  branchId: string;
  branchName: string | null;
  cityId: string;
  cityName: string | null;
  canRead: boolean;
  canProcess: boolean;
}

const ACTIVE_ASSIGNMENT = [AssignmentStatus.ASSIGNED, AssignmentStatus.PICKED_UP, AssignmentStatus.IN_TRANSIT];

/**
 * ✅ LIVREURS PAR BRANCHE — commandes RESTAURANT
 *
 *  Un livreur (rôle DELIVER) est rattaché à une ou plusieurs BRANCHES (company_has_user_resource.branchId)
 *  avec des permissions sur la ressource des commandes restaurant (ORDERS_RESTAURANT) :
 *    • lecture (can_read)                  → reçoit la notification et VOIT les commandes de SA branche ;
 *    • modification / gestion (can_update, can_manage) → peut PRENDRE / TRAITER la commande.
 *  Une commande appartient à la branche de la VILLE du restaurant (comme pour les administrateurs).
 *  ➜ un livreur de la branche X ne voit que les commandes de X, celui de Y celles de Y.
 *
 *  Dès qu'un livreur traite (prend) une commande, elle lui est AFFECTÉE (order_delivery_assignments)
 *  et entre dans son HISTORIQUE. Le premier qui la prend la garde : les autres reçoivent « déjà prise ».
 */
@Injectable()
export class BranchDeliveryService {
  private readonly logger = new Logger(BranchDeliveryService.name);

  constructor(
    @InjectRepository(OrderEntity) private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(OrderDeliveryAssignment) private readonly assignmentRepo: Repository<OrderDeliveryAssignment>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => NotificationsGateway)) private readonly gateway: NotificationsGateway,
    @Inject(forwardRef(() => OrderDeliveryService)) private readonly orderDelivery: OrderDeliveryService,
    // ✅ Nouvelle commande = APPEL (sonnerie plein écran) chez les livreurs de la branche
    private readonly orderCalls: OrderCallService,
  ) { }

  /** Appel (sonnerie) pour les livreurs : ORDER_CALL_DELIVERERS=true (défaut) ; ORDER_CALL_PUSH=false coupe tous les appels */
  private get ringDeliverers(): boolean {
    return this.orderCalls.enabled && String(process.env.ORDER_CALL_DELIVERERS ?? 'true').toLowerCase() !== 'false';
  }

  // ============================================================
  // RÉGLAGES (.env)
  // ============================================================
  /** Ressources « commandes restaurant » (DELIVERY_ORDER_RESOURCES=ORDERS_RESTAURANT,RESTAURANT.ORDER) */
  private get resources(): string[] {
    const env = String(process.env.DELIVERY_ORDER_RESOURCES || '')
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);
    return env.length ? env : ['ORDERS_RESTAURANT', 'RESTAURANT.ORDER'];
  }

  /** Types de commande concernés (DELIVERY_BRANCH_ORDER_TYPES, défaut RESTAURANT seulement) */
  private get orderTypes(): string[] {
    const env = String(process.env.DELIVERY_BRANCH_ORDER_TYPES || '')
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);
    return env.length ? env : [CompanyType.RESTAURANT];
  }

  /** Statuts où une commande peut encore être prise par un livreur */
  private get takeableStatuses(): OrderStatus[] {
    const env = String(process.env.DELIVERY_TAKEABLE_STATUSES || '')
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter((s) => (Object.values(OrderStatus) as string[]).includes(s)) as OrderStatus[];
    return env.length ? env : [OrderStatus.PENDING, OrderStatus.VALIDATED, OrderStatus.PROCESSING, OrderStatus.COMPLETED];
  }

  private t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params) as any;
  }

  isBranchOrder(order: Pick<OrderEntity, 'type'>): boolean {
    return this.orderTypes.includes(String(order?.type || '').toUpperCase());
  }

  // ============================================================
  // DROITS DES LIVREURS PAR BRANCHE
  // ============================================================
  /**
   * Permissions des livreurs sur les commandes restaurant, par branche (et ville de la branche).
   * `userIds` : un ou plusieurs livreurs ; `cityIds` : seulement les branches de ces villes.
   */
  async rights(filter: { userIds?: string[]; cityIds?: string[] }): Promise<DelivererBranchRight[]> {
    if (filter.cityIds && !filter.cityIds.length) return [];
    if (filter.userIds && !filter.userIds.length) return [];
    const params: any[] = [UserRole.DELIVER, this.resources];
    let where = '';
    if (filter.userIds) {
      where += ' AND u.id IN (?)';
      params.push(filter.userIds);
    }
    if (filter.cityIds) {
      where += ' AND b.cityId IN (?)';
      params.push(filter.cityIds);
    }
    const rows: any[] = await this.dataSource.query(
      `SELECT u.id AS userId, u.fullName AS fullName, u.phone AS phone,
              b.id AS branchId, b.name AS branchName, b.cityId AS cityId, c.name AS cityName,
              MAX(chur.can_read) AS canRead, MAX(chur.can_update) AS canUpdate, MAX(chur.can_manage) AS canManage
         FROM users u
         JOIN user_has_company uhc ON uhc.userId = u.id
         JOIN company_has_user_resource chur ON chur.userCompanyId = uhc.id AND chur.status = 1
         JOIN resources r ON r.id = chur.resourceId
         JOIN branches b ON b.id = chur.branchId AND b.status = 1 AND (b.deleted = 0 OR b.deleted IS NULL)
         LEFT JOIN cities c ON c.id = b.cityId
        WHERE u.role = ? AND u.isActive = 1 AND UPPER(r.name) IN (?) ${where}
        GROUP BY u.id, u.fullName, u.phone, b.id, b.name, b.cityId, c.name`,
      params,
    );
    return rows
      .map((r) => {
        const canProcess = Number(r.canUpdate) === 1 || Number(r.canManage) === 1;
        return {
          userId: r.userId,
          fullName: r.fullName ?? null,
          phone: r.phone ?? null,
          branchId: r.branchId,
          branchName: r.branchName ?? null,
          cityId: r.cityId,
          cityName: r.cityName ?? null,
          canRead: canProcess || Number(r.canRead) === 1,
          canProcess,
        };
      })
      .filter((r) => r.cityId && r.canRead);
  }

  /** Branches (et villes) d'un livreur, avec ses droits */
  async scope(userId: string) {
    const rights = await this.rights({ userIds: [userId] });
    return {
      branches: rights.map((r) => ({
        branchId: r.branchId,
        branchName: r.branchName,
        cityId: r.cityId,
        cityName: r.cityName,
        canRead: r.canRead,
        canProcess: r.canProcess,
      })),
      readCityIds: [...new Set(rights.filter((r) => r.canRead).map((r) => r.cityId))],
      processCityIds: [...new Set(rights.filter((r) => r.canProcess).map((r) => r.cityId))],
    };
  }

  /** Villes d'une commande = villes des restaurants (sous-commandes) */
  async orderCityIds(orderId: string): Promise<string[]> {
    const rows: any[] = await this.dataSource.query(
      'SELECT DISTINCT co.cityId AS cityId FROM sub_orders so JOIN company co ON co.id = so.companyId WHERE so.orderId = ? AND co.cityId IS NOT NULL',
      [orderId],
    );
    return rows.map((r) => r.cityId).filter(Boolean);
  }

  // ============================================================
  // 1. NOUVELLE COMMANDE → notification aux livreurs de la branche
  // ============================================================
  /**
   * Prévient les livreurs des branches de la ville de la commande (permission lecture ou plus).
   * Ne bloque jamais la commande.
   */
  async notifyNewOrder(order: OrderEntity, cityIds: string[], cityName: string | null, lang = 'fr', excludeUserIds: string[] = []) {
    try {
      if (!this.isBranchOrder(order) || !cityIds.length) return 0;
      const rights = await this.rights({ cityIds });
      const byUser = new Map<string, DelivererBranchRight[]>();
      for (const r of rights) {
        if (excludeUserIds.includes(r.userId) || r.userId === (order as any).userId) continue;
        byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
      }
      if (!byUser.size) {
        this.logger.log(`🚚 Commande ${order.invoiceNumber} : aucun livreur dans la branche (${cityName || cityIds.join(', ')})`);
        return 0;
      }
      const title = this.t('delivery_branch.new_order_title', lang);
      const body = this.t('delivery_branch.new_order_body', lang, {
        invoiceNumber: order.invoiceNumber,
        city: cityName || '',
        totalAmount: order.totalAmount,
        currency: (order as any).currency || '',
      });
      for (const [userId, list] of byUser) {
        const data = {
          entity: 'ORDER',
          entityId: order.id,
          orderId: order.id,
          invoiceNumber: order.invoiceNumber,
          type: order.type,
          branchId: list[0].branchId,
          branchName: list[0].branchName,
          city: cityName,
          canProcess: list.some((r) => r.canProcess),
          action: 'DELIVERY_NEW_ORDER',
        };
        await this.notificationsService.sendAndSaveNotification(userId, title, body, NotificationType.DELIVERY_NEW_ORDER, data);
        this.gateway.server?.to(userId).emit('delivery:new-order', data);
      }

      // 📞 Comme un APPEL : le téléphone du livreur sonne (écran plein écran, même verrouillé / app fermée)
      //    jusqu'à ce qu'un livreur prenne la commande, qu'elle soit traitée / annulée, ou après ORDER_CALL_RING_SECONDS.
      if (this.ringDeliverers) {
        const reached = await this.orderCalls.ring([...byUser.keys()], order.id, title, body, {
          action: 'DELIVERY_NEW_ORDER',
          audience: 'deliverer',
          invoiceNumber: order.invoiceNumber,
          city: cityName || '',
          canTake: 'true',
        });
        this.logger.log(`📞 Commande ${order.invoiceNumber} : appel chez ${reached.length}/${byUser.size} livreur(s)`);
      }
      this.logger.log(`🚚 Commande ${order.invoiceNumber} : ${byUser.size} livreur(s) de la branche prévenu(s)`);
      return byUser.size;
    } catch (e: any) {
      this.logger.warn(`Notification livreurs (commande ${order?.invoiceNumber}) : ${e?.message}`);
      return 0;
    }
  }

  // ============================================================
  // 2. COMMANDES DE MA BRANCHE (le livreur ne voit que sa branche)
  // ============================================================
  /**
   * scope = available : à prendre (sans livreur) ; assigned : les miennes en cours ; all : toutes celles de ma branche.
   */
  async branchOrders(user: UserEntity, query: { scope?: string; status?: string; page?: number; limit?: number }, lang = 'fr') {
    this.assertDeliverer(user, lang);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const scopeName = String(query.scope || 'available').toLowerCase();
    const myScope = await this.scope(user.id);
    if (!myScope.readCityIds.length) {
      return {
        message: this.t('delivery_branch.no_branch', lang),
        data: { items: [], total: 0, page, limit, totalPages: 0, branches: myScope.branches },
      };
    }

    const qb = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'customer')
      .leftJoinAndSelect('order.addressUser', 'addressUser')
      .leftJoinAndSelect('addressUser.city', 'addressCity')
      .leftJoinAndSelect('order.subOrders', 'subOrder')
      .leftJoinAndSelect('subOrder.company', 'restaurant')
      .leftJoinAndSelect('restaurant.city', 'restaurantCity')
      .leftJoinAndSelect('order.currentDeliveryUser', 'currentDeliver')
      .where('order.type IN (:...types)', { types: this.orderTypes })
      .andWhere(
        'EXISTS (SELECT 1 FROM sub_orders so2 JOIN company co2 ON co2.id = so2.companyId WHERE so2.orderId = order.id AND co2.cityId IN (:...cities))',
        { cities: myScope.readCityIds },
      );

    const activeSub = (alias: string) =>
      `SELECT 1 FROM order_delivery_assignments ${alias} WHERE ${alias}.orderId = order.id AND ${alias}.isActive = 1 AND ${alias}.status IN (:...activeSt)`;
    if (scopeName === 'available') {
      qb.andWhere('order.status IN (:...takeable)', { takeable: this.takeableStatuses })
        .andWhere(`NOT EXISTS (${activeSub('oda')})`, { activeSt: ACTIVE_ASSIGNMENT });
    } else if (scopeName === 'assigned') {
      qb.andWhere(`EXISTS (${activeSub('oda')} AND oda.deliverId = :me)`, { activeSt: ACTIVE_ASSIGNMENT, me: user.id });
    }
    if (query.status) qb.andWhere('order.status = :st', { st: String(query.status).toUpperCase() });

    const [items, total] = await qb
      .orderBy('order.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      message: this.t('delivery_branch.orders', lang),
      data: {
        items: items.map((o) => this.orderView(o, user.id, myScope.processCityIds)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        scope: scopeName,
        branches: myScope.branches,
      },
    };
  }

  private orderView(o: OrderEntity, meId: string, processCityIds: string[]) {
    const restaurants = (o.subOrders || []).map((so) => so.company).filter(Boolean) as any[];
    const cityIds = restaurants.map((c) => c.cityId).filter(Boolean);
    const takenBy = o.currentDeliveryUserId || null;
    return {
      id: o.id,
      invoiceNumber: o.invoiceNumber,
      status: o.status,
      type: o.type,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod ?? null,
      paid: o.paid,
      totalAmount: o.totalAmount,
      shippingCost: (o as any).shippingCost ?? null,
      grandTotal: o.grandTotal,
      currency: (o as any).currency ?? null,
      createdAt: o.createdAt,
      customer: o.user ? { id: o.user.id, fullName: o.user.fullName, phone: o.user.phone } : null,
      address: o.addressUser
        ? {
            address: (o.addressUser as any).address ?? null,
            latitude: (o.addressUser as any).latitude ?? null,
            longitude: (o.addressUser as any).longitude ?? null,
            phone: (o.addressUser as any).phone ?? null,
            city: (o.addressUser as any).city?.name ?? null,
          }
        : null,
      restaurants: restaurants.map((c) => ({
        id: c.id,
        name: c.companyName,
        address: c.address ?? c.companyAddress ?? null,
        latitude: c.latitude ?? null,
        longitude: c.longitude ?? null,
        city: c.city?.name ?? null,
      })),
      delivery: {
        assignedToMe: takenBy === meId,
        taken: !!takenBy,
        deliverer: o.currentDeliveryUser ? { id: o.currentDeliveryUser.id, fullName: o.currentDeliveryUser.fullName } : null,
      },
      /** ✅ Le livreur peut-il prendre / traiter cette commande ? */
      canTake: !takenBy && this.takeableStatuses.includes(o.status) && cityIds.some((c) => processCityIds.includes(c)),
    };
  }

  // ============================================================
  // 3. PRENDRE / TRAITER UNE COMMANDE → affectée au livreur
  // ============================================================
  /**
   * Le livreur prend la commande : vérifications (branche, permission, statut), puis affectation.
   * Verrou sur la commande : si deux livreurs cliquent en même temps, un seul l'obtient.
   * Renvoie l'affectation (déjà existante si c'est lui qui l'a déjà).
   */
  async takeOrder(orderId: string, user: UserEntity, lang = 'fr', opts: { fromStatusChange?: boolean } = {}) {
    this.assertDeliverer(user, lang);
    const myScope = await this.scope(user.id);

    const result = await this.dataSource.transaction(async (m) => {
      const ordersTable = this.dataSource.getMetadata(OrderEntity).tableName;
      const locked: any[] = await m.query(`SELECT id, type, status, currentDeliveryUserId FROM \`${ordersTable}\` WHERE id = ? FOR UPDATE`, [orderId]);
      const row = locked[0];
      if (!row) throw new NotFoundException(this.t('order_not_found', lang));
      if (!this.isBranchOrder(row)) throw new BadRequestException(this.t('delivery_branch.not_branch_order', lang));

      // Branche : la commande doit être dans une ville où le livreur peut traiter
      const cities = await this.orderCityIds(orderId);
      if (!cities.some((c) => myScope.processCityIds.includes(c))) {
        throw new ForbiddenException(this.t('delivery_branch.not_your_branch', lang));
      }

      // Déjà affectée ?
      const current = await m.findOne(OrderDeliveryAssignment, {
        where: { orderId, isActive: true, status: In(ACTIVE_ASSIGNMENT) },
      });
      if (current) {
        if (current.deliverId === user.id) return { assignment: current, created: false };
        throw new ConflictException(this.t('delivery_branch.already_taken', lang));
      }
      if (!opts.fromStatusChange && !this.takeableStatuses.includes(row.status)) {
        throw new BadRequestException(this.t('delivery_branch.not_takeable', lang, { status: row.status }));
      }

      const assignment = await m.save(
        OrderDeliveryAssignment,
        m.create(OrderDeliveryAssignment, {
          orderId,
          deliverId: user.id,
          assignedById: user.id, // ✅ pris par le livreur lui-même
          status: AssignmentStatus.ASSIGNED,
          assignedAt: new Date(),
          isActive: true,
          notes: opts.fromStatusChange ? 'Affectée automatiquement : le livreur a traité la commande' : 'Prise par le livreur',
        }),
      );
      await m.update(OrderEntity, { id: orderId }, { currentDeliveryUserId: user.id });
      return { assignment, created: true, cities };
    });

    if (result.created) void this.afterTaken(orderId, user, result.assignment, result.cities || [], lang);
    return {
      message: this.t(result.created ? 'delivery_branch.taken' : 'delivery_branch.already_yours', lang),
      data: result.assignment,
    };
  }

  /** Après la prise : room de suivi, client et propriétaire prévenus, les autres livreurs informés */
  private async afterTaken(orderId: string, deliver: UserEntity, assignment: OrderDeliveryAssignment, cities: string[], lang: string) {
    // 📞 Commande prise : la sonnerie s'arrête sur tous les téléphones (autres livreurs, admins)
    this.orderCalls.stop(orderId, 'HANDLED', deliver.id);
    try {
      this.gateway.joinOrderRoom(deliver.id, orderId);
      this.gateway.sendNewDeliveryAssignment(deliver.id, {
        assignmentId: assignment.id,
        orderId,
        status: assignment.status,
        assignedAt: assignment.assignedAt,
        createdAt: assignment.createdAt,
      });

      const order = await this.orderRepo.findOne({
        where: { id: orderId },
        relations: ['user', 'orderItems', 'orderItems.product', 'orderItems.product.images', 'subOrders', 'subOrders.company'],
      });
      const full = await this.userRepo.findOne({ where: { id: deliver.id } });
      if (order?.user) {
        await this.orderDelivery.processOrderNotifications(
          order,
          order.user,
          order,
          lang,
          undefined, // le livreur s'est affecté lui-même : pas de notification à lui-même
          full?.fullName,
          full?.phone,
          undefined,
        );
      }

      // Les autres livreurs de la branche : la commande n'est plus disponible
      const others = (await this.rights({ cityIds: cities })).map((r) => r.userId).filter((id) => id !== deliver.id);
      const ids = [...new Set(others)];
      for (const id of ids) {
        this.gateway.server?.to(id).emit('delivery:order-taken', { orderId, deliverId: deliver.id });
      }
      if (ids.length) {
        await this.notificationsService.deleteByData(ids, 'orderId', orderId, [NotificationType.DELIVERY_NEW_ORDER]);
      }
    } catch (e: any) {
      this.logger.warn(`Après prise de la commande ${orderId} : ${e?.message}`);
    }
  }

  /**
   * ✅ Appelé quand un LIVREUR change le statut d'une commande restaurant :
   * la commande lui est affectée automatiquement (ou refus si un autre livreur l'a déjà).
   */
  async ensureAssignedOnProcess(orderId: string, user: UserEntity, lang = 'fr') {
    if (user?.role !== UserRole.DELIVER) return;
    const order = await this.orderRepo.findOne({ where: { id: orderId }, select: ['id', 'type'] });
    if (!order || !this.isBranchOrder(order)) return;
    await this.takeOrder(orderId, user, lang, { fromStatusChange: true });
  }

  // ============================================================
  // 4. HISTORIQUE DU LIVREUR
  // ============================================================
  async history(user: UserEntity, query: { status?: string; from?: string; to?: string; page?: number; limit?: number }, lang = 'fr') {
    this.assertDeliverer(user, lang);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const qb = this.assignmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.order', 'order')
      .leftJoinAndSelect('order.user', 'customer')
      .leftJoinAndSelect('order.addressUser', 'addressUser')
      .leftJoinAndSelect('addressUser.city', 'addressCity')
      .leftJoinAndSelect('order.subOrders', 'subOrder')
      .leftJoinAndSelect('subOrder.company', 'restaurant')
      .where('a.deliverId = :me', { me: user.id });
    if (query.status) qb.andWhere('a.status = :st', { st: String(query.status).toUpperCase() });
    if (query.from) qb.andWhere('a.createdAt >= :from', { from: new Date(`${String(query.from).slice(0, 10)}T00:00:00`) });
    if (query.to) qb.andWhere('a.createdAt < DATE_ADD(:to, INTERVAL 1 DAY)', { to: String(query.to).slice(0, 10) });

    const [items, total] = await qb.orderBy('a.createdAt', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();

    const stats: any[] = await this.dataSource.query(
      `SELECT a.status AS status, COUNT(*) AS n, COALESCE(SUM(o.shippingCost), 0) AS shipping
         FROM order_delivery_assignments a JOIN orders o ON o.id = a.orderId
        WHERE a.deliverId = ? GROUP BY a.status`,
      [user.id],
    ).catch(() => []);

    return {
      message: this.t('delivery_branch.history', lang),
      data: {
        items: items.map((a) => ({
          assignmentId: a.id,
          status: a.status,
          isActive: a.isActive,
          assignedAt: a.assignedAt ?? a.createdAt,
          pickedUpAt: a.pickedUpAt ?? null,
          deliveredAt: a.deliveredAt ?? null,
          selfAssigned: a.assignedById === user.id,
          notes: a.notes ?? null,
          order: a.order
            ? {
                id: a.order.id,
                invoiceNumber: a.order.invoiceNumber,
                status: a.order.status,
                type: a.order.type,
                totalAmount: a.order.totalAmount,
                shippingCost: (a.order as any).shippingCost ?? null,
                grandTotal: a.order.grandTotal,
                currency: (a.order as any).currency ?? null,
                paymentMethod: a.order.paymentMethod ?? null,
                createdAt: a.order.createdAt,
                customer: a.order.user ? { fullName: a.order.user.fullName, phone: a.order.user.phone } : null,
                address: (a.order.addressUser as any)?.address ?? null,
                city: (a.order.addressUser as any)?.city?.name ?? null,
                restaurants: (a.order.subOrders || []).map((so) => so.company?.companyName).filter(Boolean),
              }
            : null,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        stats: {
          total: stats.reduce((s, r) => s + Number(r.n), 0),
          byStatus: Object.fromEntries(stats.map((r) => [r.status, Number(r.n)])),
          delivered: Number(stats.find((r) => r.status === AssignmentStatus.DELIVERED)?.n || 0),
        },
      },
    };
  }

  // ============================================================
  // OUTILS
  // ============================================================
  private assertDeliverer(user: UserEntity, lang: string) {
    if (!user || user.role !== UserRole.DELIVER) throw new ForbiddenException(this.t('delivery_branch.deliverers_only', lang));
  }

  // ============================================================
  // ✅ AFFECTATION PAR VILLE (tous les types de commande)
  //    Une commande de Goma n'est confiée qu'à un livreur rattaché à une branche de Goma.
  // ============================================================

  /** Contrôle de ville à l'affectation : DELIVERY_ENFORCE_CITY=false pour le désactiver */
  get enforceCity(): boolean {
    return String(process.env.DELIVERY_ENFORCE_CITY ?? 'true').toLowerCase() !== 'false';
  }

  /**
   * Ville(s) d'une commande : ville des entreprises (sous-commandes),
   * sinon ville de l'adresse de livraison.
   */
  async orderCities(orderId: string): Promise<{ id: string; name: string | null }[]> {
    let rows: any[] = await this.dataSource.query(
      `SELECT DISTINCT c.id AS id, c.name AS name
         FROM sub_orders so
         JOIN company co ON co.id = so.companyId
         JOIN cities c ON c.id = co.cityId
        WHERE so.orderId = ?`,
      [orderId],
    );
    if (!rows.length) {
      rows = await this.dataSource.query(
        `SELECT c.id AS id, c.name AS name
           FROM orders o
           JOIN address_user a ON a.id = o.addressUserId
           JOIN cities c ON c.id = a.cityId
          WHERE o.id = ?`,
        [orderId],
      );
    }
    return rows.filter((r) => r.id).map((r) => ({ id: r.id, name: r.name ?? null }));
  }

  /**
   * Livreurs (rôle DELIVER, actifs) rattachés à une branche active des villes données :
   * branche principale (user_has_company.branchId) OU branche d'une permission active.
   * `companyId` : seulement les collaborateurs de cette entreprise.
   */
  async deliverersInCities(cityIds: string[], companyId?: string | null) {
    if (!cityIds.length) return [];
    const params: any[] = [UserRole.DELIVER, cityIds];
    const companyFilter = companyId ? ' AND uhc.companyId = ?' : '';
    if (companyId) params.push(companyId);
    const rows: any[] = await this.dataSource.query(
      `SELECT DISTINCT u.id AS userId, u.fullName AS fullName, u.phone AS phone, u.email AS email,
              uhc.companyId AS companyId, co.companyName AS companyName,
              b.id AS branchId, b.name AS branchName, b.cityId AS cityId, c.name AS cityName,
              (b.id = uhc.branchId) AS isMain
         FROM users u
         JOIN user_has_company uhc ON uhc.userId = u.id
         LEFT JOIN company co ON co.id = uhc.companyId
         JOIN branches b ON (b.id = uhc.branchId
                             OR b.id IN (SELECT chur.branchId FROM company_has_user_resource chur
                                          WHERE chur.userCompanyId = uhc.id AND chur.status = 1))
                        AND b.status = 1 AND (b.deleted = 0 OR b.deleted IS NULL)
         LEFT JOIN cities c ON c.id = b.cityId
        WHERE u.role = ? AND u.isActive = 1 AND b.cityId IN (?)${companyFilter}`,
      params,
    );
    return rows;
  }

  /** Le livreur est-il rattaché à une branche de l'une de ces villes ? */
  async isDelivererInCities(deliverId: string, cityIds: string[]): Promise<boolean> {
    if (!cityIds.length) return true; // ville inconnue : pas de restriction
    const params: any[] = [deliverId, cityIds];
    const rows: any[] = await this.dataSource.query(
      `SELECT 1
         FROM user_has_company uhc
         JOIN branches b ON (b.id = uhc.branchId
                             OR b.id IN (SELECT chur.branchId FROM company_has_user_resource chur
                                          WHERE chur.userCompanyId = uhc.id AND chur.status = 1))
                        AND b.status = 1 AND (b.deleted = 0 OR b.deleted IS NULL)
        WHERE uhc.userId = ? AND b.cityId IN (?)
        LIMIT 1`,
      params,
    );
    return rows.length > 0;
  }

  // ============================================================
  // ✅ AFFECTATION PAR PERMISSION SUR LA BRANCHE
  //    Peut être affecté à une commande : tout collaborateur ACTIF qui a, sur une branche de la ville
  //    de la commande, une permission active sur la ressource des commandes de ce type
  //    (ORDERS_RESTAURANT, ORDERS_SHOP, ORDERS_CAR, ORDERS_MARKET…), quel que soit son rôle.
  //    Les livreurs (rôle DELIVER) de la ville restent proposés comme avant.
  // ============================================================

  /** Niveau de permission exigé : « update » (modification ou gestion, défaut) ou « read » (lecture suffit) */
  private get assignLevel(): 'update' | 'read' {
    return String(process.env.DELIVERY_ASSIGN_PERMISSION || 'update').trim().toLowerCase() === 'read' ? 'read' : 'update';
  }

  /** Livreurs (rôle DELIVER) de la ville toujours proposés : DELIVERY_ASSIGN_INCLUDE_DELIVERERS=false pour les exclure */
  private get includeDeliverRole(): boolean {
    return String(process.env.DELIVERY_ASSIGN_INCLUDE_DELIVERERS ?? 'true').toLowerCase() !== 'false';
  }

  /**
   * Ressources qui donnent le droit d'être affecté à une commande de ce type
   * (+ ressources ajoutées dans DELIVERY_ASSIGN_RESOURCES, ex : DELIVERY).
   */
  assignResourcesFor(type?: string | null): string[] {
    const t = String(type || '').toUpperCase();
    let base: string[];
    switch (t) {
      case CompanyType.RESTAURANT:
        base = ['ORDERS_RESTAURANT', 'RESTAURANT.ORDER'];
        break;
      case CompanyType.SHOP:
        base = ['ORDERS_SHOP', 'SHOP.ORDER'];
        break;
      case CompanyType.CAR:
      case CompanyType.TAXI:
        base = ['ORDERS_CAR'];
        break;
      case CompanyType.GROCERY:
        base = ['ORDERS_MARKET', 'GROCERY.ORDER'];
        break;
      default:
        base = ['ORDERS_MARKET']; // même repli que PermissionHelper.getOrderResourceByCompanyType
    }
    const extra = String(process.env.DELIVERY_ASSIGN_RESOURCES || '')
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);
    return [...new Set([...base, ...extra])];
  }

  /**
   * Collaborateurs (tout rôle) avec une permission active sur ces ressources, dans une branche active
   * de ces villes. `cityIds` vide = toutes les villes. Une ligne par (collaborateur, branche).
   */
  async permittedUsersInCities(
    cityIds: string[],
    resources: string[],
    filter: { companyId?: string | null; userIds?: string[] } = {},
  ): Promise<any[]> {
    if (!resources.length) return [];
    if (filter.userIds && !filter.userIds.length) return [];
    const params: any[] = [resources];
    let where = '';
    if (cityIds.length) {
      where += ' AND b.cityId IN (?)';
      params.push(cityIds);
    }
    if (filter.companyId) {
      where += ' AND uhc.companyId = ?';
      params.push(filter.companyId);
    }
    if (filter.userIds) {
      where += ' AND u.id IN (?)';
      params.push(filter.userIds);
    }
    const level =
      this.assignLevel === 'read'
        ? '(MAX(chur.can_read) = 1 OR MAX(chur.can_update) = 1 OR MAX(chur.can_manage) = 1)'
        : '(MAX(chur.can_update) = 1 OR MAX(chur.can_manage) = 1)';
    return this.dataSource.query(
      `SELECT u.id AS userId, u.fullName AS fullName, u.phone AS phone, u.email AS email, u.role AS role,
              uhc.companyId AS companyId, co.companyName AS companyName,
              b.id AS branchId, b.name AS branchName, b.cityId AS cityId, c.name AS cityName,
              (b.id = uhc.branchId) AS isMain,
              MAX(chur.can_read) AS canRead, MAX(chur.can_update) AS canUpdate, MAX(chur.can_manage) AS canManage,
              GROUP_CONCAT(DISTINCT r.name) AS resources
         FROM users u
         JOIN user_has_company uhc ON uhc.userId = u.id
         LEFT JOIN company co ON co.id = uhc.companyId
         JOIN company_has_user_resource chur ON chur.userCompanyId = uhc.id AND chur.status = 1
         JOIN resources r ON r.id = chur.resourceId
         JOIN branches b ON b.id = chur.branchId AND b.status = 1 AND (b.deleted = 0 OR b.deleted IS NULL)
         LEFT JOIN cities c ON c.id = b.cityId
        WHERE u.isActive = 1 AND UPPER(r.name) IN (?)${where}
        GROUP BY u.id, u.fullName, u.phone, u.email, u.role, uhc.companyId, co.companyName,
                 b.id, b.name, b.cityId, c.name, uhc.branchId
       HAVING ${level}`,
      params,
    );
  }

  /**
   * ✅ Cette personne peut-elle être affectée à cette commande ?
   *  - permission (niveau DELIVERY_ASSIGN_PERMISSION) sur la ressource du type de commande,
   *    dans une branche de la ville de la commande (ville inconnue : n'importe quelle branche) ;
   *  - ou livreur (rôle DELIVER) rattaché à une branche de la ville (comme avant).
   */
  async canBeAssigned(userId: string, order: Pick<OrderEntity, 'id' | 'type'>): Promise<boolean> {
    const cityIds = (await this.orderCities(order.id)).map((c) => c.id);
    const permitted = await this.permittedUsersInCities(cityIds, this.assignResourcesFor(order.type), { userIds: [userId] });
    if (permitted.length) return true;
    if (!this.includeDeliverRole) return false;
    const user = await this.userRepo.findOne({ where: { id: userId }, select: ['id', 'role', 'isActive'] as any });
    if (!user || user.role !== UserRole.DELIVER || (user as any).isActive === false) return false;
    return this.isDelivererInCities(userId, cityIds);
  }

  /**
   * ✅ Personnes à proposer pour une commande (écran « Affecter ») :
   *  tous les collaborateurs des branches de la ville de la commande qui ont la permission
   *  sur ce type de commande (quel que soit leur rôle) + les livreurs de la ville.
   * Triés : peut traiter la commande d'abord, puis le moins occupé (affectations en cours).
   */
  async eligibleDeliverers(orderId: string, user: UserEntity, query: { search?: string; companyId?: string }, lang = 'fr') {
    const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
    if (!isAdmin && !user?.activeCompanyId) {
      throw new ForbiddenException(this.t('delivery_branch.eligible_forbidden', lang));
    }
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(this.t('delivery_branch.order_not_found', lang));

    const cities = await this.orderCities(orderId);
    const cityIds = cities.map((c) => c.id);
    // Non admin : seulement les collaborateurs de son entreprise active
    const companyId = isAdmin ? query.companyId || null : user.activeCompanyId;
    const resources = this.assignResourcesFor(order.type);

    // 1) Collaborateurs avec la permission sur la branche (tout rôle)
    const permitted = cityIds.length ? await this.permittedUsersInCities(cityIds, resources, { companyId }) : [];
    // 2) Livreurs (rôle DELIVER) de la ville, comme avant
    const deliverRows = this.includeDeliverRole ? await this.deliverersInCities(cityIds, companyId) : [];

    // Commande restaurant : pour les livreurs sans permission sur la branche, la permission de traitement compte
    const restaurant = this.isBranchOrder(order);
    const deliverIds = [...new Set(deliverRows.map((r) => r.userId))];
    const rights = restaurant && deliverIds.length ? await this.rights({ userIds: deliverIds, cityIds }) : [];
    const processIds = new Set(rights.filter((r) => r.canProcess).map((r) => r.userId));

    const userIds = [...new Set([...permitted.map((r) => r.userId), ...deliverIds])];

    // Charge de travail : affectations en cours
    const busy: any[] = userIds.length
      ? await this.dataSource.query(
        `SELECT deliverId, COUNT(*) AS total FROM order_delivery_assignments
          WHERE isActive = 1 AND status IN (?) AND deliverId IN (?) GROUP BY deliverId`,
        [ACTIVE_ASSIGNMENT, userIds],
      )
      : [];
    const busyMap = new Map(busy.map((b) => [b.deliverId, Number(b.total)]));
    const current = await this.assignmentRepo.findOne({ where: { orderId, isActive: true, status: In(ACTIVE_ASSIGNMENT) } });

    const byUser = new Map<string, any>();
    const ensure = (r: any) => {
      let d = byUser.get(r.userId);
      if (!d) {
        d = {
          userId: r.userId,
          fullName: r.fullName ?? null,
          phone: r.phone ?? null,
          email: r.email ?? null,
          role: r.role ?? null,
          /** PERMISSION = permission sur la branche ; DELIVER_ROLE = livreur de la ville */
          source: 'DELIVER_ROLE',
          branches: [] as any[],
          canProcess: false,
          activeAssignments: busyMap.get(r.userId) ?? 0,
          isCurrent: current?.deliverId === r.userId,
        };
        byUser.set(r.userId, d);
      }
      return d;
    };
    const addBranch = (d: any, r: any, perm: { canRead: boolean; canUpdate: boolean; canManage: boolean; resources: string[] } | null) => {
      const existing = d.branches.find((b: any) => b.branchId === r.branchId);
      if (existing) {
        if (perm && !existing.permission) existing.permission = perm;
        return;
      }
      d.branches.push({
        branchId: r.branchId,
        branchName: r.branchName ?? null,
        cityId: r.cityId,
        cityName: r.cityName ?? null,
        companyId: r.companyId ?? null,
        companyName: r.companyName ?? null,
        isMain: Number(r.isMain) === 1,
        permission: perm,
      });
    };

    for (const r of permitted) {
      const d = ensure(r);
      d.source = 'PERMISSION';
      d.role = r.role ?? d.role;
      const perm = {
        canRead: Number(r.canRead) === 1 || Number(r.canUpdate) === 1 || Number(r.canManage) === 1,
        canUpdate: Number(r.canUpdate) === 1,
        canManage: Number(r.canManage) === 1,
        resources: String(r.resources || '').split(',').filter(Boolean),
      };
      if (perm.canUpdate || perm.canManage) d.canProcess = true;
      addBranch(d, r, perm);
    }
    for (const r of deliverRows) {
      const d = ensure({ ...r, role: UserRole.DELIVER });
      if (!d.role) d.role = UserRole.DELIVER;
      if (!restaurant || processIds.has(r.userId)) d.canProcess = true;
      addBranch(d, r, null);
    }

    let list = [...byUser.values()];
    const search = query.search?.trim().toLowerCase();
    if (search) {
      const digits = search.replace(/\D/g, '').replace(/^(00)?243/, '').replace(/^0+/, '');
      list = list.filter(
        (d) =>
          String(d.fullName || '').toLowerCase().includes(search) ||
          String(d.email || '').toLowerCase().includes(search) ||
          (digits.length >= 6 && String(d.phone || '').replace(/\D/g, '').includes(digits)),
      );
    }
    list.sort(
      (a, b) =>
        Number(b.canProcess) - Number(a.canProcess) ||
        a.activeAssignments - b.activeAssignments ||
        String(a.fullName || '').localeCompare(String(b.fullName || '')),
    );

    return {
      message: cityIds.length
        ? this.t('delivery_branch.eligible_list', lang, { count: list.length, city: cities.map((c) => c.name).filter(Boolean).join(', ') })
        : this.t('delivery_branch.eligible_no_city', lang),
      data: {
        orderId,
        orderType: order.type,
        cities,
        enforced: this.enforceCity,
        resources,
        permissionLevel: this.assignLevel,
        deliverers: list,
      },
    };
  }

  /** Admin : un livreur peut-il traiter cette commande (sa branche + permission) ? */
  async canProcess(deliverId: string, orderId: string): Promise<boolean> {
    const cities = await this.orderCityIds(orderId);
    if (!cities.length) return true; // ville inconnue : pas de restriction
    const rights = await this.rights({ userIds: [deliverId], cityIds: cities });
    if (rights.some((r) => r.canProcess)) return true;
    // ✅ Collaborateur (tout rôle) avec la permission de traitement sur une branche de la ville
    const order = await this.orderRepo.findOne({ where: { id: orderId }, select: ['id', 'type'] });
    if (!order) return false;
    const permitted = await this.permittedUsersInCities(cities, this.assignResourcesFor(order.type), { userIds: [deliverId] });
    return permitted.some((r) => Number(r.canUpdate) === 1 || Number(r.canManage) === 1);
  }
}

