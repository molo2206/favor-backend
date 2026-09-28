import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ConflictException,
    Inject,
    forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { OrderDeliveryAssignment } from './entities/order-delivery-assignment.entity';
import { OrderEntity } from './entities/order.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { AssignmentStatus } from './enum/assignment-status.enum';
import { OrderStatus } from './enum/order.status.enum';
import { UserRole } from 'src/users/enum/user-role-enum';
import { I18nService } from 'src/libs/common/src';
import { NotificationsService } from 'src/notification/notifications.service';
import { NotificationsGateway } from 'src/notification/notifications.gateway';

@Injectable()
export class OrderDeliveryService {
    private readonly logger = new Logger(OrderDeliveryService.name);

    constructor(
        @InjectRepository(OrderDeliveryAssignment)
        private readonly assignmentRepo: Repository<OrderDeliveryAssignment>,

        @InjectRepository(OrderEntity)
        private readonly orderRepo: Repository<OrderEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepo: Repository<UserEntity>,

        private readonly i18n: I18nService,
        private readonly notificationsService: NotificationsService,

        @Inject(forwardRef(() => NotificationsGateway))
        private readonly notificationsGateway: NotificationsGateway,
    ) { }

    // ============================================================
    // 🔧 HELPER : QueryBuilder avec TOUTES les relations de la commande
    // ============================================================
    private buildAssignmentQuery(alias: string = 'assignment') {
        return this.assignmentRepo
            .createQueryBuilder(alias)
            .leftJoinAndSelect(`${alias}.order`, 'order')
            .leftJoinAndSelect('order.user', 'user')
            .leftJoinAndSelect('order.addressUser', 'addressUser')
            .leftJoinAndSelect('addressUser.country', 'addressCountry')
            .leftJoinAndSelect('addressUser.city', 'addressCity')
            .leftJoinAndSelect('order.orderItems', 'orderItem')
            .leftJoinAndSelect('orderItem.product', 'product')
            .leftJoinAndSelect('product.company', 'productCompany')
            .leftJoinAndSelect('product.category', 'productCategory')
            .leftJoinAndSelect('product.measure', 'productMeasure')
            .leftJoinAndSelect('order.subOrders', 'subOrder')
            .leftJoinAndSelect('subOrder.items', 'subOrderItem')
            .leftJoinAndSelect('subOrderItem.product', 'subOrderProduct')
            .leftJoinAndSelect('subOrderProduct.company', 'subOrderProductCompany')
            .leftJoinAndSelect('subOrderProduct.category', 'subOrderProductCategory')
            .leftJoinAndSelect('subOrderProduct.measure', 'subOrderProductMeasure')
            .leftJoinAndSelect('subOrder.company', 'subOrderCompany')
            .leftJoinAndSelect('subOrderCompany.city', 'subOrderCompanyCity')
            .leftJoinAndSelect(`${alias}.deliver`, 'deliver')
            .leftJoinAndSelect(`${alias}.assignedBy`, 'assignedBy');
    }

    // ============================================================
    // 📦 AFFECTER UN LIVREUR À UNE COMMANDE
    // ============================================================
    async assignDeliveryToOrder(
        orderId: string,
        deliverId: string,
        assignedById: string,
        lang: string = 'fr',
    ) {
        this.logger.log('========================================');
        this.logger.log(`📦 ASSIGN DELIVERY - DÉBUT`);
        this.logger.log(`   orderId    = ${orderId}`);
        this.logger.log(`   deliverId  = ${deliverId}`);
        this.logger.log(`   assignedBy = ${assignedById}`);
        this.logger.log(`   lang       = ${lang}`);
        this.logger.log('========================================');

        // 1. Récupérer la commande AVEC TOUTES les relations
        this.logger.log(`🔍 [1/6] Recherche de la commande ${orderId}...`);
        const order = await this.orderRepo
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.user', 'user')
            .leftJoinAndSelect('order.addressUser', 'addressUser')
            .leftJoinAndSelect('addressUser.country', 'addressCountry')
            .leftJoinAndSelect('addressUser.city', 'addressCity')
            .leftJoinAndSelect('order.orderItems', 'orderItem')
            .leftJoinAndSelect('orderItem.product', 'product')
            .leftJoinAndSelect('product.company', 'productCompany')
            .leftJoinAndSelect('product.category', 'productCategory')
            .leftJoinAndSelect('product.measure', 'productMeasure')
            .leftJoinAndSelect('order.subOrders', 'subOrder')
            .leftJoinAndSelect('subOrder.items', 'subOrderItem')
            .leftJoinAndSelect('subOrderItem.product', 'subOrderProduct')
            .leftJoinAndSelect('subOrderProduct.company', 'subOrderProductCompany')
            .leftJoinAndSelect('subOrderProduct.category', 'subOrderProductCategory')
            .leftJoinAndSelect('subOrderProduct.measure', 'subOrderProductMeasure')
            .leftJoinAndSelect('subOrder.company', 'subOrderCompany')
            .leftJoinAndSelect('subOrderCompany.city', 'subOrderCompanyCity')
            .where('order.id = :orderId', { orderId })
            .getOne();

        if (!order) {
            this.logger.warn(`❌ Commande ${orderId} introuvable`);
            throw new NotFoundException(
                await this.i18n.translate('order_not_found', lang),
            );
        }

        this.logger.log(`✅ Commande trouvée : ${order.id}`);
        this.logger.log(`   status      = ${order.status}`);
        this.logger.log(`   invoiceNumber = ${order.invoiceNumber}`);
        this.logger.log(`   addressUser = ${order.addressUser?.id || 'AUCUNE'}`);

        // ✅ Vérifier que l'adresse a des coordonnées GPS
        if (
            !order.addressUser ||
            order.addressUser.latitude == null ||
            order.addressUser.longitude == null
        ) {
            this.logger.warn(`❌ Adresse sans coordonnées GPS`);
            throw new BadRequestException(
                await this.i18n.translate('delivery_address_missing_coordinates', lang),
            );
        }

        this.logger.log(`🎯 Adresse de livraison :`);
        this.logger.log(`   address = ${order.addressUser.address}`);
        this.logger.log(`   lat     = ${order.addressUser.latitude}`);
        this.logger.log(`   lng     = ${order.addressUser.longitude}`);
        this.logger.log(`   phone   = ${order.addressUser.phone}`);
        this.logger.log(`   city    = ${order.addressUser.city?.name ?? 'N/A'}`);
        this.logger.log(`   country = ${order.addressUser.country?.name ?? 'N/A'}`);


        // 3. Vérifier le livreur
        this.logger.log(`🔍 [3/6] Recherche du livreur ${deliverId}...`);
        const deliver = await this.userRepo.findOne({ where: { id: deliverId } });

        if (!deliver) {
            this.logger.warn(`❌ Livreur ${deliverId} introuvable`);
            throw new NotFoundException(
                await this.i18n.translate('user_not_found', lang),
            );
        }

        this.logger.log(`✅ Livreur trouvé : ${deliver.fullName}`);
        this.logger.log(`   role  = ${deliver.role}`);
        this.logger.log(`   phone = ${deliver.phone}`);

        if (deliver.role !== UserRole.DELIVER) {
            this.logger.warn(`❌ L'utilisateur n'a pas le rôle DELIVERY`);
            throw new BadRequestException(
                await this.i18n.translate('user_not_delivery', lang),
            );
        }
        this.logger.log(`✅ Rôle DELIVERY OK`);

        // 4. Vérifier qu'il n'y a pas déjà une affectation active
        this.logger.log(`🔍 [4/6] Vérification d'une affectation active...`);
        const existing = await this.assignmentRepo.findOne({
            where: {
                orderId,
                isActive: true,
                status: In([
                    AssignmentStatus.ASSIGNED,
                    AssignmentStatus.PICKED_UP,
                    AssignmentStatus.IN_TRANSIT,
                ]),
            },
        });

        if (existing) {
            this.logger.warn(
                ` Affectation active existante : ${existing.id} (status: ${existing.status})`,
            );
            throw new ConflictException(
                await this.i18n.translate('order_already_assigned', lang),
            );
        }
        this.logger.log(`✅ Aucune affectation active existante`);

        // 5. Créer l'affectation
        this.logger.log(`🔍 [5/6] Création de l'affectation...`);
        const assignment = this.assignmentRepo.create({
            orderId,
            deliverId,
            assignedById,
            status: AssignmentStatus.ASSIGNED,
            assignedAt: new Date(),
            isActive: true,
        });

        const saved = await this.assignmentRepo.save(assignment);

        this.logger.log(`✅ Affectation créée :`);
        this.logger.log(`   id         = ${saved.id}`);
        this.logger.log(`   status     = ${saved.status}`);
        this.logger.log(`   assignedAt = ${saved.assignedAt}`);
        this.logger.log(`   assignedBy = ${saved.assignedById}`);

        // 6. Mettre à jour la commande
        this.logger.log(`🔍 [6/6] Mise à jour de la commande...`);
        await this.orderRepo.update(orderId, {
            currentDeliveryUserId: deliverId,
        });
        this.logger.log(
            `✅ Commande mise à jour : currentDeliveryUserId = ${deliverId}`,
        );

        // 7. Notifier le livreur via WebSocket
        this.logger.log(`📡 Envoi de la notification WebSocket au livreur...`);
        this.notificationsGateway.sendNewDeliveryAssignment(deliverId, {
            assignmentId: saved.id,
            orderId: saved.orderId,
            status: saved.status,
            assignedAt: saved.assignedAt,
            createdAt: saved.createdAt,
        });

        // 8. Vérifier si le livreur est connecté
        const activeUsers = this.notificationsGateway.getActiveUsers();
        const isConnected = activeUsers.includes(deliverId);

        this.logger.log(`🔌 Livreur connecté ? ${isConnected}`);
        this.logger.log(`   Utilisateurs actifs : ${JSON.stringify(activeUsers)}`);

        if (!isConnected) {
            this.logger.log(`📨 Livreur non connecté → envoi push...`);
            await this.notificationsService.sendNotificationToUser(
                deliverId,
                await this.i18n.translate('new_delivery_assignment_title', lang),
                await this.i18n.translate('new_delivery_assignment_body', lang, {
                    orderId,
                }),
                'DELIVERY' as any,
                saved,
            );
            this.logger.log(`✅ Notification push envoyée`);
        } else {
            this.logger.log(`✅ Notification WebSocket envoyée directement`);
        }

        this.logger.log('========================================');
        this.logger.log(`✅ ASSIGN DELIVERY - SUCCÈS`);
        this.logger.log('========================================');

        return {
            message: await this.i18n.translate('delivery_assigned', lang),
            data: saved,
        };
    }

    // ============================================================
    // 📍 METTRE À JOUR LA POSITION DU LIVREUR
    // ============================================================
    async updateLocation(
        orderId: string,
        location: {
            latitude: number;
            longitude: number;
            speed?: number;
            heading?: number;
        },
    ) {
        this.logger.log('========================================');
        this.logger.log(`📍 UPDATE LOCATION - DÉBUT`);
        this.logger.log(`   orderId   = ${orderId}`);
        this.logger.log(`   latitude  = ${location.latitude}`);
        this.logger.log(`   longitude = ${location.longitude}`);
        this.logger.log(`   speed     = ${location.speed ?? 'N/A'}`);
        this.logger.log(`   heading   = ${location.heading ?? 'N/A'}`);
        this.logger.log('========================================');

        // 1. Récupérer l'affectation avec TOUTES les relations
        this.logger.log(`🔍 [1/4] Recherche de l'affectation active...`);
        const assignment = await this.buildAssignmentQuery('assignment')
            .where('assignment.orderId = :orderId', { orderId })
            .andWhere('assignment.isActive = :isActive', { isActive: true })
            .getOne();

        if (!assignment) {
            this.logger.warn(
                `❌ Aucune affectation active pour la commande ${orderId}`,
            );
            throw new NotFoundException(
                `Aucune affectation active pour la commande ${orderId}`,
            );
        }

        this.logger.log(`✅ Affectation trouvée :`);
        this.logger.log(`   id        = ${assignment.id}`);
        this.logger.log(`   status    = ${assignment.status}`);
        this.logger.log(`   deliverId = ${assignment.deliverId}`);

        // 2. Récupérer les coordonnées cibles depuis Order.addressUser
        const targetLatitude = assignment.order.addressUser?.latitude;
        const targetLongitude = assignment.order.addressUser?.longitude;

        this.logger.log(`🎯 Coordonnées cibles (Order.addressUser) :`);
        this.logger.log(`   address         = ${assignment.order.addressUser?.address}`);
        this.logger.log(`   targetLatitude  = ${targetLatitude}`);
        this.logger.log(`   targetLongitude = ${targetLongitude}`);

        if (targetLatitude == null || targetLongitude == null) {
            this.logger.warn(`❌ Adresse sans coordonnées GPS`);
            throw new BadRequestException(
                `Adresse de livraison sans coordonnées GPS pour la commande ${orderId}`,
            );
        }

        // 3. Calculer la distance (Haversine)
        this.logger.log(`📐 [2/4] Calcul de la distance (Haversine)...`);
        const distanceKm = this.calculateDistance(
            location.latitude,
            location.longitude,
            targetLatitude,
            targetLongitude,
        );

        const estimatedArrivalMinutes = Math.round((distanceKm / 30) * 60);

        this.logger.log(`✅ Distance calculée : ${distanceKm} km`);
        this.logger.log(`✅ ETA calculé : ${estimatedArrivalMinutes} min`);

        // 4. Mise à jour de la position du livreur
        this.logger.log(`📝 [3/4] Mise à jour de la position...`);
        assignment.currentLatitude = location.latitude;
        assignment.currentLongitude = location.longitude;
        assignment.currentSpeed = location.speed;
        assignment.currentHeading = location.heading;
        assignment.distanceRemainingKm = distanceKm;
        assignment.estimatedArrivalMinutes = estimatedArrivalMinutes;
        assignment.lastLocationUpdate = new Date();

        // ✅ Auto: ASSIGNED → PICKED_UP (< 50 km)
        if (
            assignment.status === AssignmentStatus.ASSIGNED &&
            distanceKm < 50
        ) {
            this.logger.log(
                `🔄 AUTO STATUS: ASSIGNED → PICKED_UP (distance: ${distanceKm} km < 50)`,
            );
            assignment.status = AssignmentStatus.PICKED_UP;
            assignment.pickedUpAt = new Date();
        }

        // ✅ Auto: PICKED_UP → IN_TRANSIT (< 20 km)
        if (
            assignment.status === AssignmentStatus.PICKED_UP &&
            distanceKm < 20
        ) {
            this.logger.log(
                `🔄 AUTO STATUS: PICKED_UP → IN_TRANSIT (distance: ${distanceKm} km < 20)`,
            );
            assignment.status = AssignmentStatus.IN_TRANSIT;
        }

        // ✅ Auto: IN_TRANSIT → DELIVERED (< 0.1 km = 100m)
        if (
            assignment.status === AssignmentStatus.IN_TRANSIT &&
            distanceKm < 0.1
        ) {
            this.logger.log(
                `🔄 AUTO STATUS: IN_TRANSIT → DELIVERED (distance: ${distanceKm} km < 0.1)`,
            );
            assignment.status = AssignmentStatus.DELIVERED;
            assignment.deliveredAt = new Date();
            assignment.isActive = false;

            await this.orderRepo.update(orderId, {
                status: OrderStatus.DELIVERED,
            });
            this.logger.log(`✅ Order status mis à jour : DELIVERED`);
        }

        const updated = await this.assignmentRepo.save(assignment);
        this.logger.log(`✅ Affectation sauvegardée`);
        this.logger.log(`   nouveau status = ${updated.status}`);

        // 5. Diffuser la position via WebSocket
        this.logger.log(
            `📡 [4/4] Diffusion WebSocket à la room order-${orderId}...`,
        );
        this.notificationsGateway.sendDeliveryLocation(orderId, {
            orderId,
            deliverId: updated.deliverId,
            latitude: location.latitude,
            longitude: location.longitude,
            speed: location.speed,
            heading: location.heading,
            distanceRemainingKm: updated.distanceRemainingKm,
            estimatedArrivalMinutes: updated.estimatedArrivalMinutes,
            status: updated.status,
        });
        this.logger.log(`✅ Diffusé`);

        this.logger.log('========================================');
        this.logger.log(`✅ UPDATE LOCATION - SUCCÈS`);
        this.logger.log('========================================');

        return updated;
    }

    // ============================================================
    // ✅ CHANGER LE STATUT MANUELLEMENT (PAR PIN)
    // ============================================================
    async updateStatus(
        orderId: string,
        pin: string,
        note?: string,
    ) {
        this.logger.log('========================================');
        this.logger.log(`✅ UPDATE STATUS - DÉBUT`);
        this.logger.log(`   orderId = ${orderId}`);
        this.logger.log(`   pin     = ${pin ? '******' : 'N/A'}`);
        this.logger.log(`   note    = ${note ?? 'N/A'}`);
        this.logger.log('========================================');

        const assignment = await this.assignmentRepo
            .createQueryBuilder('assignment')
            .leftJoinAndSelect('assignment.order', 'order')
            .where('assignment.orderId = :orderId', { orderId })
            .andWhere('assignment.isActive = :isActive', { isActive: true })
            .getOne();

        if (!assignment) {
            this.logger.warn(`❌ Affectation introuvable pour ${orderId}`);
            throw new NotFoundException(`Affectation introuvable pour ${orderId}`);
        }

        this.logger.log(
            `✅ Affectation trouvée (status actuel: ${assignment.status})`,
        );

        if (!pin) {
            this.logger.warn(`❌ PIN manquant`);
            throw new BadRequestException(
                'Le PIN de la commande est requis.',
            );
        }

        if (!assignment.order?.pin) {
            this.logger.warn(`❌ Aucun PIN défini sur la commande`);
            throw new BadRequestException(
                'Aucun PIN défini pour cette commande.',
            );
        }

        if (assignment.order.pin !== pin) {
            this.logger.warn(`❌ PIN incorrect pour ${orderId}`);
            throw new BadRequestException(
                'PIN incorrect. La livraison ne peut pas être confirmée.',
            );
        }

        this.logger.log(`✅ PIN correct → passage automatique à DELIVERED`);

        assignment.status = AssignmentStatus.DELIVERED;
        assignment.deliveredAt = new Date();
        assignment.isActive = false;

        if (note) assignment.notes = note;

        await this.orderRepo.update(orderId, {
            status: OrderStatus.DELIVERED,
        });
        this.logger.log(`✅ Order status mis à jour : DELIVERED`);

        const updated = await this.assignmentRepo.save(assignment);
        this.logger.log(
            `✅ Affectation sauvegardée (nouveau status: ${updated.status})`,
        );

        this.logger.log(`📡 Diffusion WebSocket...`);
        this.notificationsGateway.sendDeliveryStatusUpdate(orderId, {
            orderId,
            status: updated.status,
            note: note ?? 'Livraison confirmée par PIN',
        });
        this.logger.log(`✅ Diffusé`);

        this.logger.log('========================================');
        this.logger.log(`✅ UPDATE STATUS - SUCCÈS`);
        this.logger.log('========================================');

        return updated;
    }

    // ============================================================
    // 🚚 DÉMARRER LE TRACKING (LIVREUR)
    // ============================================================
    async startTracking(
        orderId: string,
        deliverId: string,
        location: {
            latitude: number;
            longitude: number;
            speed?: number;
            heading?: number;
        },
        lang: string = 'fr',
    ) {
        this.logger.log('========================================');
        this.logger.log(`🚚 START TRACKING - DÉBUT`);
        this.logger.log(`   orderId   = ${orderId}`);
        this.logger.log(`   deliverId = ${deliverId}`);
        this.logger.log(`   lat/lng   = ${location.latitude}, ${location.longitude}`);
        this.logger.log('========================================');

        const assignment = await this.buildAssignmentQuery('assignment')
            .where('assignment.orderId = :orderId', { orderId })
            .andWhere('assignment.deliverId = :deliverId', { deliverId })
            .andWhere('assignment.isActive = :isActive', { isActive: true })
            .getOne();

        if (!assignment) {
            this.logger.warn(
                `❌ Aucune affectation active trouvée pour orderId=${orderId}, deliverId=${deliverId}`,
            );
            throw new NotFoundException(
                `Aucune affectation active pour cette commande avec ce livreur`,
            );
        }

        this.logger.log(`✅ Affectation trouvée :`);
        this.logger.log(`   id     = ${assignment.id}`);
        this.logger.log(`   status = ${assignment.status}`);

        const allowedStatuses = [
            AssignmentStatus.ASSIGNED,
            AssignmentStatus.PICKED_UP,
        ];

        if (!allowedStatuses.includes(assignment.status)) {
            this.logger.warn(
                `❌ Statut incompatible : ${assignment.status}. Autorisés : ${allowedStatuses.join(', ')}`,
            );
            throw new BadRequestException(
                `Impossible de démarrer le tracking. Statut actuel : ${assignment.status}`,
            );
        }

        const targetLatitude = assignment.order.addressUser?.latitude;
        const targetLongitude = assignment.order.addressUser?.longitude;

        if (targetLatitude == null || targetLongitude == null) {
            this.logger.warn(`❌ Adresse sans coordonnées GPS`);
            throw new BadRequestException(
                `Adresse de livraison sans coordonnées GPS`,
            );
        }

        const distanceKm = this.calculateDistance(
            location.latitude,
            location.longitude,
            targetLatitude,
            targetLongitude,
        );

        const estimatedArrivalMinutes = Math.round((distanceKm / 30) * 60);

        this.logger.log(`📐 Distance initiale : ${distanceKm} km`);
        this.logger.log(`⏱️ ETA initial : ${estimatedArrivalMinutes} min`);

        assignment.currentLatitude = location.latitude;
        assignment.currentLongitude = location.longitude;
        assignment.currentSpeed = location.speed;
        assignment.currentHeading = location.heading;
        assignment.distanceRemainingKm = distanceKm;
        assignment.estimatedArrivalMinutes = estimatedArrivalMinutes;
        assignment.lastLocationUpdate = new Date();

        if (assignment.status === AssignmentStatus.ASSIGNED) {
            this.logger.log(`🔄 AUTO STATUS: ASSIGNED → PICKED_UP (démarrage)`);
            assignment.status = AssignmentStatus.PICKED_UP;
            assignment.pickedUpAt = new Date();
        }

        const updated = await this.assignmentRepo.save(assignment);
        this.logger.log(`✅ Tracking démarré - status = ${updated.status}`);

        this.notificationsGateway.sendDeliveryLocation(orderId, {
            orderId,
            deliverId: updated.deliverId,
            latitude: location.latitude,
            longitude: location.longitude,
            speed: location.speed,
            heading: location.heading,
            distanceRemainingKm: updated.distanceRemainingKm,
            estimatedArrivalMinutes: updated.estimatedArrivalMinutes,
            status: updated.status,
        });

        this.notificationsGateway.sendDeliveryStatusUpdate(orderId, {
            orderId,
            status: updated.status,
            note: 'Tracking démarré',
        });

        this.logger.log('========================================');
        this.logger.log(`✅ START TRACKING - SUCCÈS`);
        this.logger.log('========================================');

        return {
            message: 'Tracking démarré avec succès',
            data: {
                assignmentId: updated.id,
                orderId: updated.orderId,
                status: updated.status,
                distanceRemainingKm: updated.distanceRemainingKm,
                estimatedArrivalMinutes: updated.estimatedArrivalMinutes,
                targetLatitude,
                targetLongitude,
            },
        };
    }

    // ============================================================
    // 🚚 LISTE DES AFFECTATIONS ACTIVES DU LIVREUR
    // ============================================================
    async getDeliverAssignments(deliverId: string) {
        this.logger.log(
            `📋 GET DELIVER ASSIGNMENTS - deliverId = ${deliverId}`,
        );

        const assignments = await this.buildAssignmentQuery('assignment')
            .where('assignment.deliverId = :deliverId', { deliverId })
            .andWhere('assignment.isActive = :isActive', { isActive: true })
            .orderBy('assignment.createdAt', 'DESC')
            .getMany();

        this.logger.log(`✅ ${assignments.length} affectation(s) active(s)`);

        return {
            message: 'Affectations récupérées avec succès',
            data: assignments.map((a) => ({
                assignmentId: a.id,
                orderId: a.orderId,
                status: a.status,
                invoiceNumber: a.order?.invoiceNumber,
                order: a.order,
                deliver: a.deliver,
                assignedBy: a.assignedBy,
                deliveryAddress: a.order?.addressUser
                    ? {
                        address: a.order.addressUser.address,
                        firstName: a.order.addressUser.firstName,
                        lastName: a.order.addressUser.lastName,
                        phone: a.order.addressUser.phone,
                        latitude: a.order.addressUser.latitude,
                        longitude: a.order.addressUser.longitude,
                        city: a.order.addressUser.city,
                        country: a.order.addressUser.country,
                    }
                    : null,
                distanceRemainingKm: a.distanceRemainingKm,
                estimatedArrivalMinutes: a.estimatedArrivalMinutes,
                assignedAt: a.assignedAt,
                pickedUpAt: a.pickedUpAt,
                currentLatitude: a.currentLatitude,
                currentLongitude: a.currentLongitude,
                lastLocationUpdate: a.lastLocationUpdate,
            })),
        };
    }

    // ============================================================
    // 📍 DERNIÈRE POSITION
    // ============================================================
    async getLastLocation(orderId: string) {
        this.logger.log(`📍 GET LAST LOCATION - orderId = ${orderId}`);

        const assignment = await this.buildAssignmentQuery('assignment')
            .where('assignment.orderId = :orderId', { orderId })
            .andWhere('assignment.isActive = :isActive', { isActive: true })
            .getOne();

        if (!assignment) {
            this.logger.warn(`❌ Aucune affectation active pour ${orderId}`);
            return {
                orderId,
                status: null,
                message: 'Aucune affectation active',
            };
        }

        this.logger.log(`✅ Affectation trouvée`);
        this.logger.log(`   status    = ${assignment.status}`);
        this.logger.log(`   deliverId = ${assignment.deliverId}`);
        this.logger.log(
            `   lat/lng   = ${assignment.currentLatitude}, ${assignment.currentLongitude}`,
        );

        return {
            orderId,

            deliverId: assignment.deliverId,
            deliverName: assignment.deliver?.fullName,
            deliverPhone: assignment.deliver?.phone,
            deliverImage: assignment.deliver?.image,
            deliver: assignment.deliver,
            assignedBy: assignment.assignedBy,

            latitude: assignment.currentLatitude,
            longitude: assignment.currentLongitude,
            speed: assignment.currentSpeed,
            heading: assignment.currentHeading,

            targetLatitude: assignment.order?.addressUser?.latitude,
            targetLongitude: assignment.order?.addressUser?.longitude,
            deliveryAddress: assignment.order?.addressUser
                ? {
                    address: assignment.order.addressUser.address,
                    firstName: assignment.order.addressUser.firstName,
                    lastName: assignment.order.addressUser.lastName,
                    phone: assignment.order.addressUser.phone,
                    city: assignment.order.addressUser.city,
                    country: assignment.order.addressUser.country,
                }
                : null,

            order: assignment.order,

            distanceRemainingKm: assignment.distanceRemainingKm,
            estimatedArrivalMinutes: assignment.estimatedArrivalMinutes,
            status: assignment.status,
            lastLocationUpdate: assignment.lastLocationUpdate,
            assignedAt: assignment.assignedAt,
            pickedUpAt: assignment.pickedUpAt,
            deliveredAt: assignment.deliveredAt,
        };
    }

    // ============================================================
    // 📐 CALCUL DE DISTANCE (Haversine)
    // ============================================================
    private calculateDistance(
        lat1: number,
        lon1: number,
        lat2: number,
        lon2: number,
    ): number {
        const R = 6371;
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) *
            Math.cos(this.toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Math.round(R * c * 100) / 100;
    }

    private toRad(deg: number): number {
        return deg * (Math.PI / 180);
    }
}