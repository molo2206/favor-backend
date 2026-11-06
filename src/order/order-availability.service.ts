import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { OrderEntity } from './entities/order.entity';
import { OrderStatus } from './enum/order.status.enum';
import {
  ItemAvailabilityStatus,
  OrderAvailabilitySummary,
  summarizeAvailability,
} from './enum/availability-status.enum';
import { OrderItemEntity } from 'src/order-item/entities/order-item.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { CompanyHasUserResource } from 'src/company_has_usrResource/entities/company_has_userResource.entity';
import { Resource } from 'src/ressource/entity/resource.entity';
import { NotificationsService } from 'src/notification/notifications.service';
import { NotificationType } from 'src/notification/type/notification.type';
import { PermissionHelper } from 'src/users/utility/helpers/permission.helper';
import { I18nService } from 'src/libs/common/src';

/** Corps de PATCH /orders/availability/:orderId */
export interface ConfirmAvailabilityInput {
  /** Même réponse pour tous mes produits de la commande */
  status?: 'AVAILABLE' | 'UNAVAILABLE';
  note?: string | null;
  /** Ou une réponse par produit */
  items?: { orderItemId: string; status: 'AVAILABLE' | 'UNAVAILABLE'; note?: string | null }[];
}

/** La disponibilité peut être donnée / corrigée tant que la commande n'est pas en traitement */
const OPEN_STATUSES = [OrderStatus.PENDING, OrderStatus.VALIDATED];

/**
 * ✅ DISPONIBILITÉ DES PRODUITS CONFIRMÉE PAR LEUR PROPRIÉTAIRE (version simple)
 *
 *  - À la commande, chaque produit (order_items) est créé en PENDING.
 *  - Le propriétaire reçoit la notification + l'appel déjà existants (NEW_ORDER_FOR_SHOP, confirmAvailability=true).
 *  - Il ouvre la commande (GET /orders/availability/:orderId) : il ne voit que SES produits.
 *  - Il répond « Disponible » / « Indisponible » (PATCH /orders/availability/:orderId).
 *  - Plusieurs boutiques dans la commande : chacune répond pour ses produits.
 *  - Quand tous les produits ont une réponse : SEULS les administrateurs sont prévenus
 *    (tout disponible / partiellement / rien), pour la suite du traitement et de la livraison.
 *    Le client n'est pas notifié.
 *  Rien d'autre ne change dans le traitement des commandes.
 */
@Injectable()
export class OrderAvailabilityService {
  private readonly logger = new Logger(OrderAvailabilityService.name);

  constructor(
    @InjectRepository(OrderEntity) private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserHasCompanyEntity) private readonly userHasCompanyRepo: Repository<UserHasCompanyEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly notificationsService: NotificationsService,
    private readonly permissionHelper: PermissionHelper,
  ) { }

  private t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params) as any;
  }

  private userLang(user?: Partial<UserEntity> | null): string {
    const lang = (user as any)?.settings?.language || 'fr';
    return ['fr', 'en', 'sw', 'es', 'ar'].includes(lang) ? lang : 'fr';
  }

  private money(v: any): number {
    return Math.round(Number(v || 0) * 100) / 100;
  }

  private companyOf(item: OrderItemEntity): string | null {
    return (item.product as any)?.company?.id ?? null;
  }

  private label(item: OrderItemEntity): string {
    const name = item.product?.name || '-';
    return item.variationLabel ? `${name} (${item.variationLabel})` : name;
  }

  private loadOrder(orderId: string) {
    return this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['user', 'user.settings', 'orderItems', 'orderItems.product', 'orderItems.product.company', 'orderItems.product.images'],
    });
  }

  // ============================================================
  // QUI PEUT RÉPONDRE ?
  // ============================================================
  /**
   * Responsables d'une boutique (mêmes règles que la notification « nouvelle commande » des boutiques) :
   * propriétaire + utilisateurs avec une permission « commandes » ; à défaut, les utilisateurs de la boutique.
   */
  private async responders(companyIds: string[]): Promise<Map<string, string[]>> {
    const ids = [...new Set(companyIds.filter(Boolean))];
    const out = new Map<string, string[]>();
    if (!ids.length) return out;

    const links: { userId: string; companyId: string; isOwner: any }[] = await this.userHasCompanyRepo
      .createQueryBuilder('uhc')
      .select('uhc.userId', 'userId')
      .addSelect('uhc.companyId', 'companyId')
      .addSelect('uhc.isOwner', 'isOwner')
      .where('uhc.companyId IN (:...ids)', { ids })
      .getRawMany();

    const resources = (process.env.ORDER_NOTIFY_RESOURCES || 'RESTAURANT.ORDER,SHOP.ORDER,GROCERY.ORDER,ORDERS_RESTAURANT,ORDERS_SHOP,ORDERS_MARKET')
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);
    let permitted: { userId: string; companyId: string }[] = [];
    try {
      permitted = await this.userHasCompanyRepo
        .createQueryBuilder('uhc')
        .innerJoin(CompanyHasUserResource, 'chur', 'chur.userCompanyId = uhc.id')
        .innerJoin(Resource, 'r', 'r.id = chur.resourceId')
        .select('uhc.userId', 'userId')
        .addSelect('uhc.companyId', 'companyId')
        .where('uhc.companyId IN (:...ids)', { ids })
        .andWhere('UPPER(r.name) IN (:...resources)', { resources })
        .andWhere('chur.status = :active', { active: true })
        .andWhere(
          '(chur.canRead = :yes OR chur.canManage = :yes OR chur.canCreate = :yes OR chur.canUpdate = :yes OR chur.canDelete = :yes)',
          { yes: true },
        )
        .getRawMany();
    } catch (e: any) {
      this.logger.warn(`Lecture des permissions impossible : ${e?.message}`);
    }

    for (const companyId of ids) {
      const rows = links.filter((l) => l.companyId === companyId && l.userId);
      const owners = rows.filter((l) => Number(l.isOwner) === 1 || l.isOwner === true).map((l) => l.userId);
      const withPermission = permitted.filter((p) => p.companyId === companyId).map((p) => p.userId);
      const list = [...owners, ...withPermission];
      out.set(companyId, [...new Set(list.length ? list : rows.map((l) => l.userId))]);
    }
    return out;
  }

  /** Super admin, ou admin avec la permission de gérer ce type de commande : répond pour toutes les boutiques */
  private async isStaff(user: UserEntity, orderType: string): Promise<boolean> {
    if (user?.role === UserRole.SUPER_ADMIN) return true;
    if (user?.role !== UserRole.ADMIN) return false;
    const resource = this.permissionHelper.getOrderResourceByCompanyType(orderType as any);
    if (!resource) return false;
    const rows: any[] = await this.dataSource.query(
      `SELECT 1 FROM user_has_company uhc
         JOIN company_has_user_resource chur ON chur.userCompanyId = uhc.id
         JOIN resources r ON r.id = chur.resourceId
        WHERE uhc.userId = ? AND r.name = ? AND (chur.can_manage = 1 OR chur.can_update = 1)
        LIMIT 1`,
      [user.id, resource],
    );
    return rows.length > 0;
  }

  /** Boutiques de la commande pour lesquelles l'utilisateur répond */
  private async myCompanies(user: UserEntity, order: OrderEntity): Promise<{ companyIds: Set<string>; staff: boolean }> {
    const all = [...new Set((order.orderItems || []).map((i) => this.companyOf(i)).filter(Boolean))] as string[];
    if (await this.isStaff(user, order.type as any)) return { companyIds: new Set(all), staff: true };
    const map = await this.responders(all);
    return { companyIds: new Set(all.filter((c) => (map.get(c) ?? []).includes(user.id))), staff: false };
  }

  // ============================================================
  // VUE DU PROPRIÉTAIRE
  // ============================================================
  async view(orderId: string, user: UserEntity, lang = 'fr') {
    const order = await this.loadOrder(orderId);
    if (!order) throw new NotFoundException(this.t('order.order_not_found_by_id', lang, { orderId }));
    const mine = await this.myCompanies(user, order);
    if (!mine.companyIds.size) throw new ForbiddenException(this.t('order.availability_forbidden', lang));
    return { message: this.t('order.availability_view', lang), data: this.toView(order, mine.companyIds) };
  }

  private toView(order: OrderEntity, companyIds: Set<string>) {
    const open = OPEN_STATUSES.includes(order.status) && !order.cancelledAt;
    const items = (order.orderItems || [])
      .filter((i) => companyIds.has(this.companyOf(i) as string))
      .map((i) => ({
        orderItemId: i.id,
        productId: i.productId,
        name: i.product?.name ?? null,
        image: (i.product as any)?.images?.[0]?.url ?? i.product?.image ?? null,
        variationLabel: i.variationLabel ?? null,
        quantity: i.quantity,
        price: i.price,
        companyId: this.companyOf(i),
        companyName: (i.product as any)?.company?.companyName ?? null,
        availabilityStatus: i.availabilityStatus ?? null,
        availabilityConfirmedAt: i.availabilityConfirmedAt ?? null,
        availabilityNote: i.availabilityNote ?? null,
      }));
    return {
      orderId: order.id,
      invoiceNumber: order.invoiceNumber,
      status: order.status,
      type: order.type,
      currency: order.currency,
      createdAt: order.createdAt,
      customer: order.user ? { id: order.user.id, fullName: order.user.fullName } : null,
      /** Résumé de TOUTE la commande (toutes boutiques) */
      availability: summarizeAvailability((order.orderItems || []).map((i) => i.availabilityStatus)),
      items,
      /** Afficher les boutons « Disponible » / « Indisponible » */
      canConfirm: open && items.some((i) => i.availabilityStatus != null),
    };
  }

  /** Mes commandes avec des produits en attente de réponse */
  async myPending(user: UserEntity, query: { page?: number; limit?: number }, lang = 'fr') {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const linked: { companyId: string }[] = await this.userHasCompanyRepo
      .createQueryBuilder('uhc')
      .select('uhc.companyId', 'companyId')
      .where('uhc.userId = :uid', { uid: user.id })
      .getRawMany();
    const candidates = [...new Set(linked.map((l) => l.companyId).filter(Boolean))];
    const map = await this.responders(candidates);
    const companyIds = candidates.filter((c) => (map.get(c) ?? []).includes(user.id));
    if (!companyIds.length) return { message: this.t('order.availability_list', lang), data: { items: [], page, limit } };

    const rows: any[] = await this.dataSource.query(
      `SELECT o.id AS orderId, o.invoiceNumber AS invoiceNumber, o.status AS status, o.createdAt AS createdAt,
              COUNT(oi.id) AS pendingItems
         FROM orders o
         JOIN order_items oi ON oi.orderId = o.id
         JOIN products p ON p.id = oi.productId
        WHERE p.companyId IN (?) AND oi.availabilityStatus = 'PENDING'
          AND o.status IN ('PENDING','VALIDATED') AND o.cancelledAt IS NULL
        GROUP BY o.id, o.invoiceNumber, o.status, o.createdAt
        ORDER BY o.createdAt DESC
        LIMIT ? OFFSET ?`,
      [companyIds, limit, (page - 1) * limit],
    );
    return {
      message: this.t('order.availability_list', lang),
      data: { items: rows.map((r) => ({ ...r, pendingItems: Number(r.pendingItems || 0) })), page, limit },
    };
  }

  // ============================================================
  // RÉPONSE DU PROPRIÉTAIRE
  // ============================================================
  async confirm(orderId: string, user: UserEntity, input: ConfirmAvailabilityInput, lang = 'fr') {
    const order = await this.loadOrder(orderId);
    if (!order) throw new NotFoundException(this.t('order.order_not_found_by_id', lang, { orderId }));
    if (!OPEN_STATUSES.includes(order.status) || order.cancelledAt) {
      throw new BadRequestException(this.t('order.availability_closed', lang, { status: order.status }));
    }
    const mine = await this.myCompanies(user, order);
    if (!mine.companyIds.size) throw new ForbiddenException(this.t('order.availability_forbidden', lang));

    const myItems = (order.orderItems || []).filter(
      (i) => mine.companyIds.has(this.companyOf(i) as string) && i.availabilityStatus != null,
    );
    const isChoice = (s: any) => s === ItemAvailabilityStatus.AVAILABLE || s === ItemAvailabilityStatus.UNAVAILABLE;
    const note = (n: any) => (n == null || String(n).trim() === '' ? null : String(n).trim().slice(0, 500));

    let decisions: { id: string; status: string; note: string | null }[];
    if (input?.items?.length) {
      const allowed = new Set(myItems.map((i) => i.id));
      decisions = input.items.map((d) => {
        const status = String(d?.status || '').toUpperCase();
        if (!isChoice(status)) throw new BadRequestException(this.t('order.availability_invalid_status', lang));
        if (!allowed.has(d.orderItemId)) {
          throw new ForbiddenException(this.t('order.availability_item_forbidden', lang, { orderItemId: d.orderItemId }));
        }
        return { id: d.orderItemId, status, note: note(d.note ?? input.note) };
      });
    } else {
      const status = String(input?.status || '').toUpperCase();
      if (!isChoice(status)) throw new BadRequestException(this.t('order.availability_invalid_status', lang));
      // Un admin sans liste répond seulement pour les produits encore en attente
      const targets = mine.staff ? myItems.filter((i) => i.availabilityStatus === ItemAvailabilityStatus.PENDING) : myItems;
      decisions = targets.map((i) => ({ id: i.id, status, note: note(input.note) }));
    }
    if (!decisions.length) throw new BadRequestException(this.t('order.availability_nothing_to_confirm', lang));

    // Verrou sur la commande : deux boutiques peuvent répondre en même temps
    const now = new Date();
    const { before, after } = await this.dataSource.transaction(async (m: EntityManager) => {
      await m.query('SELECT id FROM orders WHERE id = ? FOR UPDATE', [order.id]);
      const read = async () =>
        summarizeAvailability(
          ((await m.query('SELECT availabilityStatus AS s FROM order_items WHERE orderId = ?', [order.id])) as any[]).map((r) => r.s),
        );
      const b = await read();
      for (const d of decisions) {
        await m.query(
          `UPDATE order_items
              SET availabilityStatus = ?, availabilityConfirmedAt = ?, availabilityConfirmedById = ?, availabilityNote = ?
            WHERE id = ? AND orderId = ?`,
          [d.status, now, user.id, d.note, d.id, order.id],
        );
      }
      return { before: b, after: await read() };
    });

    this.logger.log(`📦 Commande ${order.invoiceNumber} : ${decisions.length} réponse(s) de ${user.id} → ${after}`);

    // Tous les produits ont une réponse (ou la réponse finale a changé) : administrateurs prévenus (pas le client)
    if (after && after !== OrderAvailabilitySummary.PENDING && after !== before) {
      void this.notifyResult(order.id, after);
    }

    const fresh = (await this.loadOrder(order.id))!;
    return {
      message: this.t(after === OrderAvailabilitySummary.PENDING ? 'order.availability_saved_waiting' : 'order.availability_saved', lang),
      data: this.toView(fresh, mine.companyIds),
    };
  }

  // ============================================================
  // RÉSULTAT : ADMINISTRATEURS SEULEMENT
  // ============================================================
  private async notifyResult(orderId: string, result: OrderAvailabilitySummary): Promise<void> {
    try {
      const order = await this.loadOrder(orderId);
      if (!order) return;
      const items = order.orderItems || [];
      const unavailable = items.filter((i) => i.availabilityStatus === ItemAvailabilityStatus.UNAVAILABLE);
      const available = items.filter((i) => i.availabilityStatus === ItemAvailabilityStatus.AVAILABLE);
      const list = (l: OrderItemEntity[]) => l.map((i) => this.label(i)).join(', ') || '-';
      const params = {
        invoiceNumber: order.invoiceNumber,
        unavailable: list(unavailable),
        available: list(available),
        availableAmount: this.money(available.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 0), 0)).toFixed(2),
        currency: order.currency,
      };
      const key = result.toLowerCase(); // available | partial | unavailable
      const data = {
        entity: 'ORDER',
        entityId: String(order.id),
        orderId: String(order.id),
        action: 'ORDER_AVAILABILITY',
        availability: String(result),
        invoiceNumber: String(order.invoiceNumber ?? ''),
      };

      // 🧑‍💼 Administrateurs (super admins + admins qui gèrent ce type de commande), dans les back-offices
      const resource = this.permissionHelper.getOrderResourceByCompanyType(order.type as any);
      const staff: { id: string }[] = await this.dataSource.query(
        `SELECT DISTINCT u.id AS id FROM users u
          WHERE u.isActive = 1 AND (u.role = ? OR (u.role = ? AND EXISTS (
                SELECT 1 FROM user_has_company uhc
                  JOIN company_has_user_resource chur ON chur.userCompanyId = uhc.id
                  JOIN resources r ON r.id = chur.resourceId
                 WHERE uhc.userId = u.id AND r.name = ? AND chur.can_manage = 1)))`,
        [UserRole.SUPER_ADMIN, UserRole.ADMIN, resource || '-'],
      );
      const ids = staff.map((s) => s.id).filter((id) => id && id !== order.userId);
      const users = ids.length ? await this.userRepo.find({ where: { id: In(ids) }, relations: ['settings'] }) : [];
      const channels = (process.env.ORDER_STAFF_NOTIFICATION_CHANNELS || 'admin,group').split(',').map((c) => c.trim()).filter(Boolean);
      for (const u of users) {
        const lang = this.userLang(u);
        await this.notificationsService
          .sendAndSaveNotification(
            u.id,
            this.t(`order.availability_staff_${key}_title`, lang, params),
            this.t(`order.availability_staff_${key}_body`, lang, params),
            NotificationType.ORDER_UPDATED,
            data,
            { channels },
          )
          .catch((e: any) => this.logger.warn(`Notification admin ${u.id} : ${e?.message}`));
      }
    } catch (e: any) {
      this.logger.warn(`Résultat de disponibilité (commande ${orderId}) : ${e?.message}`);
    }
  }
}
