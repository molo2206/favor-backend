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
import { NotificationHelper } from 'src/notification/utils/notification.helper';
import { PushNotificationHelper } from 'src/users/utility/helpers/push-notification.helper';
import { SubOrderEntity } from 'src/sub-order/entities/sub-order.entity';
import { SubOrderItemEntity } from 'src/sub-order-item/entities/sub-order-item.entity';
import { PaymentStatus } from 'src/transaction/enum/payment.status.enum';
import { GeneratePin } from 'src/users/utility/helpers/GeneratePin.util';
import { NotificationType } from 'src/notification/type/notification.type';
import { GoogleService } from 'src/Course et Taxi/google-maps/google-maps.service';

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

        private readonly notificationHelpers: NotificationHelper,
        private readonly pushNotificationHelper: PushNotificationHelper,

        private readonly googleService: GoogleService,
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

    async processOrderNotifications(
        finalOrder: OrderEntity,
        user: UserEntity,
        order: OrderEntity,
        lang: string = 'fr',
        deliverId?: string,
        deliverName?: string,
        deliverPhone?: string,
        ownerId?: string,
    ): Promise<void> {
        try {
            let imageUrl: string | undefined;
            if (finalOrder.orderItems?.length) {
                const firstItem = finalOrder.orderItems[0];
                if (firstItem.product?.images?.length) imageUrl = firstItem.product.images[0].url;
                else if (firstItem.product?.image) imageUrl = firstItem.product.image;
            }

            // ============================================================
            // 🔥 1. NOTIFICATION AU CLIENT
            // ============================================================
            const hasClientPhone = user.phone && user.phone.trim() !== '';

            const clientOptions: any = {
                userId: user.id,
                pushTitle: await this.i18n.translate('client.delivery_assigned.push_title', lang),
                pushBody: await this.i18n.translate('client.delivery_assigned.push_body', lang, {
                    invoiceNumber: order.invoiceNumber,
                }),
                pushData: { entity: 'ORDER', entityId: finalOrder.id },
                imageUrl,
            };

            if (hasClientPhone) {
                clientOptions.phoneNumber = user.phone;
                clientOptions.smsBody = await this.i18n.translate('client.delivery_assigned.sms_body', lang, {
                    invoiceNumber: order.invoiceNumber,
                });
            }

            await this.pushNotificationHelper.sendAll(clientOptions);

            await this.notificationHelpers.sendNotification(
                this.notificationsService,
                user.id,
                NotificationType.ORDER_CREATED,
                lang,
                {
                    invoiceNumber: finalOrder.invoiceNumber,
                    totalAmount: finalOrder.totalAmount,
                    currency: finalOrder.currency,
                },
                'ORDER',
                finalOrder.id,
            );

            this.logger.log(`✅ [processOrderNotifications] Client notifié: ${user.id}`);

            // ============================================================
            // 🔥 2. NOTIFICATION AU LIVREUR
            // ============================================================
            if (deliverId) {
                try {
                    const deliver = await this.userRepo.findOne({ where: { id: deliverId } });
                    const hasDeliverPhone = deliver?.phone && deliver.phone.trim() !== '';

                    const deliverOptions: any = {
                        userId: deliverId,
                        pushTitle: await this.i18n.translate('deliver.delivery_assigned.push_title', lang),
                        pushBody: await this.i18n.translate('deliver.delivery_assigned.push_body', lang, {
                            invoiceNumber: order.invoiceNumber,
                            clientName: user.fullName || user.phone || '',
                            address: order.addressUser?.address || '',
                        }),
                        pushData: {
                            entity: 'ORDER',
                            entityId: finalOrder.id,
                            orderId: finalOrder.id,
                        },
                        imageUrl,
                    };

                    if (hasDeliverPhone) {
                        deliverOptions.phoneNumber = deliver!.phone;
                        deliverOptions.smsBody = await this.i18n.translate('deliver.delivery_assigned.sms_body', lang, {
                            invoiceNumber: order.invoiceNumber,
                            clientName: user.fullName || user.phone || '',
                            address: order.addressUser?.address || '',
                        });
                    }

                    await this.pushNotificationHelper.sendAll(deliverOptions);

                    await this.notificationHelpers.sendNotification(
                        this.notificationsService,
                        deliverId,
                        NotificationType.ORDER_CREATED,
                        lang,
                        {
                            invoiceNumber: finalOrder.invoiceNumber,
                            totalAmount: finalOrder.totalAmount,
                            currency: finalOrder.currency,
                        },
                        'ORDER',
                        finalOrder.id,
                    );

                    this.logger.log(`✅ [processOrderNotifications] Livreur notifié: ${deliverId}`);
                } catch (err: any) {
                    this.logger.warn(`⚠️ Erreur notification livreur: ${err.message}`);
                }
            }

            // ============================================================
            // 🔥 3. NOTIFICATION AU PROPRIÉTAIRE
            // ============================================================
            if (ownerId) {
                try {
                    const owner = await this.userRepo.findOne({ where: { id: ownerId } });
                    const hasOwnerPhone = owner?.phone && owner.phone.trim() !== '';

                    const ownerOptions: any = {
                        userId: ownerId,
                        pushTitle: await this.i18n.translate('owner.delivery_assigned.push_title', lang),
                        pushBody: await this.i18n.translate('owner.delivery_assigned.push_body', lang, {
                            invoiceNumber: order.invoiceNumber,
                            deliverName: deliverName || '',
                            clientName: user.fullName || user.phone || '',
                        }),
                        pushData: {
                            entity: 'ORDER',
                            entityId: finalOrder.id,
                            orderId: finalOrder.id,
                        },
                        imageUrl,
                    };

                    if (hasOwnerPhone) {
                        ownerOptions.phoneNumber = owner!.phone;
                        ownerOptions.smsBody = await this.i18n.translate('owner.delivery_assigned.sms_body', lang, {
                            invoiceNumber: order.invoiceNumber,
                            deliverName: deliverName || '',
                            clientName: user.fullName || user.phone || '',
                        });
                    }

                    await this.pushNotificationHelper.sendAll(ownerOptions);

                    await this.notificationHelpers.sendNotification(
                        this.notificationsService,
                        ownerId,
                        NotificationType.ORDER_CREATED,
                        lang,
                        {
                            invoiceNumber: finalOrder.invoiceNumber,
                            totalAmount: finalOrder.totalAmount,
                            currency: finalOrder.currency,
                        },
                        'ORDER',
                        finalOrder.id,
                    );

                    this.logger.log(`✅ [processOrderNotifications] Propriétaire notifié: ${ownerId}`);
                } catch (err: any) {
                    this.logger.warn(`⚠️ Erreur notification propriétaire: ${err.message}`);
                }
            }

            this.logger.log('✅ [processOrderNotifications] Terminé');
        } catch (error) {
            console.error('❌ Erreur dans processOrderNotifications:', error);
        }
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
        this.logger.log(`   status        = ${order.status}`);
        this.logger.log(`   invoiceNumber = ${order.invoiceNumber}`);
        this.logger.log(`   addressUser   = ${order.addressUser?.id || 'AUCUNE'}`);

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

        // 4. 🔥 Chercher une affectation active existante
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
            // 🔥 Si c'est le même livreur → ne rien changer
            if (existing.deliverId === deliverId) {
                this.logger.log(`ℹ️ Le livreur est déjà affecté à cette commande`);
                return {
                    message: await this.i18n.translate('delivery_assigned', lang),
                    data: existing,
                };
            }

            // 🔥 Sinon → désactiver l'ancienne affectation
            this.logger.log(
                `🔄 Remplacement du livreur : ${existing.deliverId} → ${deliverId}`,
            );
            existing.isActive = false;
            existing.notes = `Remplacé par le livreur ${deliverId}`;
            await this.assignmentRepo.save(existing);
            this.logger.log(`✅ Ancienne affectation désactivée`);
        } else {
            this.logger.log(`✅ Aucune affectation active existante`);
        }

        // 5. Créer la nouvelle affectation
        this.logger.log(`🔍 [5/6] Création de la nouvelle affectation...`);
        const assignment = this.assignmentRepo.create({
            orderId,
            deliverId,
            assignedById,
            status: AssignmentStatus.ASSIGNED,
            assignedAt: new Date(),
            isActive: true,
        });

        const saved = await this.assignmentRepo.save(assignment);

        this.logger.log(`✅ Nouvelle affectation créée :`);
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

        // ============================================================
        // 🔥 7. NOTIFICATIONS (client + livreur + propriétaire)
        // ============================================================
        this.logger.log(`📨 [processOrderNotifications] Début...`);

        try {
            // 🔥 Récupérer l'ID du propriétaire depuis la première sous-commande
            // ⚠️ Adaptez le champ selon votre CompanyEntity (ownerId / userId / createdById)
            let ownerId: string | undefined = undefined;
            if (order.subOrders && order.subOrders.length > 0) {
                const firstSubOrder = order.subOrders[0];
                const company = firstSubOrder.company as any;
                if (company) {
                    ownerId =
                        company.ownerId ||
                        company.userId ||
                        company.createdById ||
                        company.owner?.id ||
                        undefined;
                }
            }

            this.logger.log(`   clientId  = ${order.user.id}`);
            this.logger.log(`   deliverId = ${deliverId}`);
            this.logger.log(`   ownerId   = ${ownerId || 'N/A'}`);

            await this.processOrderNotifications(
                order,              // finalOrder
                order.user,         // user (client)
                order,              // order
                lang,               // lang
                deliverId,          // deliverId
                deliver.fullName,   // deliverName
                deliver.phone,      // deliverPhone
                ownerId,            // ownerId
            );

            this.logger.log(`✅ [processOrderNotifications] Terminé avec succès`);
        } catch (err: any) {
            this.logger.warn(
                `⚠️ Erreur processOrderNotifications: ${err.message}`,
            );
        }

        // 8. Notifier le livreur via WebSocket
        this.logger.log(`📡 Envoi de la notification WebSocket au livreur...`);
        this.notificationsGateway.sendNewDeliveryAssignment(deliverId, {
            assignmentId: saved.id,
            orderId: saved.orderId,
            status: saved.status,
            assignedAt: saved.assignedAt,
            createdAt: saved.createdAt,
        });

        // 9. Vérifier si le livreur est connecté
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
            this.logger.log(`✅ Notification push envoyée au livreur`);
        } else {
            this.logger.log(`✅ Notification WebSocket envoyée au livreur`);
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
        },
    ) {
        this.logger.log('========================================');
        this.logger.log(`📍 UPDATE LOCATION - DÉBUT`);
        this.logger.log(`   orderId   = ${orderId}`);
        this.logger.log(`   latitude  = ${location.latitude}`);
        this.logger.log(`   longitude = ${location.longitude}`);
        this.logger.log('========================================');

        // 1. Récupérer l'affectation active
        this.logger.log(`🔍 [1/4] Recherche de l'affectation active...`);
        const assignment = await this.buildAssignmentQuery('assignment')
            .where('assignment.orderId = :orderId', { orderId })
            .andWhere('assignment.isActive = :isActive', { isActive: true })
            .getOne();

        if (!assignment) {
            this.logger.warn(`❌ Aucune affectation active pour la commande ${orderId}`);
            throw new NotFoundException(
                `Aucune affectation active pour la commande ${orderId}`,
            );
        }

        this.logger.log(`✅ Affectation trouvée :`);
        this.logger.log(`   id        = ${assignment.id}`);
        this.logger.log(`   status    = ${assignment.status}`);
        this.logger.log(`   deliverId = ${assignment.deliverId}`);

        // 2. Coordonnées cibles
        const targetLatitude = assignment.order.addressUser?.latitude;
        const targetLongitude = assignment.order.addressUser?.longitude;

        this.logger.log(`🎯 Coordonnées cibles :`);
        this.logger.log(`   address         = ${assignment.order.addressUser?.address}`);
        this.logger.log(`   targetLatitude  = ${targetLatitude}`);
        this.logger.log(`   targetLongitude = ${targetLongitude}`);

        if (targetLatitude == null || targetLongitude == null) {
            this.logger.warn(`❌ Adresse sans coordonnées GPS`);
            throw new BadRequestException(
                `Adresse de livraison sans coordonnées GPS pour la commande ${orderId}`,
            );
        }

        // 3. Calculer la distance via Google (fallback Haversine)
        this.logger.log(`📐 [2/4] Calcul de la distance (Google)...`);

        let distanceKm: number;
        let estimatedArrivalMinutes: number;

        try {
            const origin = `${location.latitude},${location.longitude}`;
            const destination = `${targetLatitude},${targetLongitude}`;

            const googleData = await this.googleService.getDistance(
                origin,
                destination,
                false,
                { mode: 'driving', language: 'fr' },
            );

            const element = googleData?.rows?.[0]?.elements?.[0];

            if (element && element.status === 'OK') {
                distanceKm = Math.round((element.distance.value / 1000) * 100) / 100;
                estimatedArrivalMinutes = Math.round(element.duration.value / 60);
                this.logger.log(`✅ Google → ${distanceKm} km / ${estimatedArrivalMinutes} min`);
            } else {
                throw new Error(`Google status: ${element?.status || 'NOT_FOUND'}`);
            }
        } catch (error: any) {
            this.logger.warn(`⚠️ Google échoué (${error.message}) → fallback Haversine`);
            distanceKm = this.calculateDistance(
                location.latitude,
                location.longitude,
                targetLatitude,
                targetLongitude,
            );
            estimatedArrivalMinutes = Math.round((distanceKm / 30) * 60);
            this.logger.log(`✅ Haversine → ${distanceKm} km / ${estimatedArrivalMinutes} min`);
        }

        // 4. Mise à jour de la position
        this.logger.log(`📝 [3/4] Mise à jour de la position...`);
        assignment.currentLatitude = location.latitude;
        assignment.currentLongitude = location.longitude;
        assignment.distanceRemainingKm = distanceKm;
        assignment.estimatedArrivalMinutes = estimatedArrivalMinutes;
        assignment.lastLocationUpdate = new Date();

        const updated = await this.assignmentRepo.save(assignment);
        this.logger.log(`✅ Affectation sauvegardée`);

        // 5. Diffuser la position
        this.logger.log(`📡 [4/4] Diffusion WebSocket à la room order-${orderId}...`);
        this.notificationsGateway.sendDeliveryLocation(orderId, {
            orderId,
            deliverId: updated.deliverId,
            latitude: location.latitude,
            longitude: location.longitude,
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
    // 1️⃣ CONNECTER LE LIVREUR À LA ROOM
    // ============================================================
    async connectToOrderRoom(
        orderId: string,
        deliverId: string,
        lang: string = 'fr',
    ) {
        this.logger.log('========================================');
        this.logger.log(`🔌 CONNECT TO ORDER ROOM - DÉBUT`);
        this.logger.log(`   orderId   = ${orderId}`);
        this.logger.log(`   deliverId = ${deliverId}`);
        this.logger.log('========================================');

        // Vérifier que l'affectation existe
        const assignment = await this.buildAssignmentQuery('assignment')
            .where('assignment.orderId = :orderId', { orderId })
            .andWhere('assignment.deliverId = :deliverId', { deliverId })
            .andWhere('assignment.isActive = :isActive', { isActive: true })
            .getOne();

        if (!assignment) {
            this.logger.warn(`❌ Aucune affectation active`);
            throw new NotFoundException(
                `Aucune affectation active pour cette commande avec ce livreur`,
            );
        }

        // Connecter à la room
        this.notificationsGateway.joinOrderRoom(deliverId, orderId);

        this.logger.log(`✅ Livreur connecté à la room order-${orderId}`);

        return {
            status: 'connected',
            message: 'Connecté à la room de la commande',
            data: {
                orderId,
                deliverId,
                assignmentId: assignment.id,
                roomName: `order-${orderId}`,
            },
        };
    }

    // ============================================================
    // 2️⃣ DÉMARRER / ARRÊTER LE TRACKING
    // ============================================================
    async toggleTracking(
        orderId: string,
        deliverId: string,
        action: 'start' | 'stop',
        lang: string = 'fr',
    ) {
        this.logger.log('========================================');
        this.logger.log(`🚚 TOGGLE TRACKING - DÉBUT`);
        this.logger.log(`   orderId   = ${orderId}`);
        this.logger.log(`   deliverId = ${deliverId}`);
        this.logger.log(`   action    = ${action}`);
        this.logger.log('========================================');

        const assignment = await this.buildAssignmentQuery('assignment')
            .where('assignment.orderId = :orderId', { orderId })
            .andWhere('assignment.deliverId = :deliverId', { deliverId })
            .andWhere('assignment.isActive = :isActive', { isActive: true })
            .getOne();

        if (!assignment) {
            this.logger.warn(`❌ Aucune affectation active`);
            throw new NotFoundException(
                `Aucune affectation active pour cette commande avec ce livreur`,
            );
        }

        // ============================================================
        // ACTION: START
        // ============================================================
        if (action === 'start') {
            const allowedStatuses = [
                AssignmentStatus.ASSIGNED,
                AssignmentStatus.PICKED_UP,
            ];

            if (!allowedStatuses.includes(assignment.status)) {
                throw new BadRequestException(
                    `Impossible de démarrer le tracking. Statut actuel : ${assignment.status}`,
                );
            }

            if (assignment.status === AssignmentStatus.ASSIGNED) {
                assignment.status = AssignmentStatus.PICKED_UP;
                assignment.pickedUpAt = new Date();
            }

            assignment.lastLocationUpdate = new Date();
            const updated = await this.assignmentRepo.save(assignment);

            this.notificationsGateway.sendDeliveryStatusUpdate(orderId, {
                orderId,
                status: updated.status,
                note: 'Tracking démarré',
            });

            this.logger.log(`✅ Tracking démarré`);

            return {
                status: 'started',
                message: 'Tracking démarré avec succès',
                data: {
                    assignmentId: updated.id,
                    orderId: updated.orderId,
                    status: updated.status,
                    action: 'start',
                    startedAt: updated.lastLocationUpdate,
                },
            };
        }

        // ============================================================
        // ACTION: STOP
        // ============================================================
        if (action === 'stop') {
            this.notificationsGateway.sendDeliveryStatusUpdate(orderId, {
                orderId,
                status: assignment.status,
                note: 'Tracking arrêté',
            });

            this.logger.log(`✅ Tracking arrêté`);

            return {
                status: 'stopped',
                message: 'Tracking arrêté avec succès',
                data: {
                    assignmentId: assignment.id,
                    orderId: assignment.orderId,
                    status: assignment.status,
                    action: 'stop',
                    stoppedAt: new Date(),
                },
            };
        }

        throw new BadRequestException(
            `Action non reconnue : ${action}. Utilisez 'start' ou 'stop'.`,
        );
    }

    // ============================================================
    // 3️⃣ ENVOYER UNE POSITION
    // ============================================================
    async sendPosition(
        orderId: string,
        deliverId: string,
        location: { latitude: number; longitude: number },
        lang: string = 'fr',
    ) {
        this.logger.log('========================================');
        this.logger.log(`📍 SEND POSITION - DÉBUT`);
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
            throw new NotFoundException(
                `Aucune affectation active pour cette commande avec ce livreur`,
            );
        }

        const targetLatitude = assignment.order.addressUser?.latitude;
        const targetLongitude = assignment.order.addressUser?.longitude;

        if (targetLatitude == null || targetLongitude == null) {
            throw new BadRequestException(
                `Adresse de livraison sans coordonnées GPS`,
            );
        }

        // Calculer la distance via Google (fallback Haversine)
        let distanceKm: number;
        let estimatedArrivalMinutes: number;

        try {
            const origin = `${location.latitude},${location.longitude}`;
            const destination = `${targetLatitude},${targetLongitude}`;

            const googleData = await this.googleService.getDistance(
                origin,
                destination,
                false,
                { mode: 'driving', language: 'fr' },
            );

            const element = googleData?.rows?.[0]?.elements?.[0];

            if (element && element.status === 'OK') {
                distanceKm = Math.round((element.distance.value / 1000) * 100) / 100;
                estimatedArrivalMinutes = Math.round(element.duration.value / 60);
                this.logger.log(`✅ Google → ${distanceKm} km / ${estimatedArrivalMinutes} min`);
            } else {
                throw new Error(`Google status: ${element?.status || 'NOT_FOUND'}`);
            }
        } catch (error: any) {
            this.logger.warn(`⚠️ Google échoué → fallback Haversine`);
            distanceKm = this.calculateDistance(
                location.latitude,
                location.longitude,
                targetLatitude,
                targetLongitude,
            );
            estimatedArrivalMinutes = Math.round((distanceKm / 30) * 60);
        }

        // Mettre à jour la position
        assignment.currentLatitude = location.latitude;
        assignment.currentLongitude = location.longitude;
        assignment.distanceRemainingKm = distanceKm;
        assignment.estimatedArrivalMinutes = estimatedArrivalMinutes;
        assignment.lastLocationUpdate = new Date();

        const updated = await this.assignmentRepo.save(assignment);

        // Diffuser via WebSocket
        this.notificationsGateway.sendDeliveryLocation(orderId, {
            orderId,
            deliverId: updated.deliverId,
            latitude: location.latitude,
            longitude: location.longitude,
            distanceRemainingKm: updated.distanceRemainingKm,
            estimatedArrivalMinutes: updated.estimatedArrivalMinutes,
            status: updated.status,
        });

        this.logger.log(`✅ Position diffusée`);

        return {
            status: 'position_received',
            message: 'Position enregistrée et diffusée',
            data: {
                orderId,
                deliverId: updated.deliverId,
                latitude: location.latitude,
                longitude: location.longitude,
                distanceRemainingKm: updated.distanceRemainingKm,
                estimatedArrivalMinutes: updated.estimatedArrivalMinutes,
                status: updated.status,
                updatedAt: updated.lastLocationUpdate,
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