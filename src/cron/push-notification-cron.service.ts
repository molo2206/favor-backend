import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, MoreThan, Between, Not, IsNull } from 'typeorm';
import { DeviceToken } from '../firebase/entities/device-token.entity';
import { Wishlist } from '../products/entities/wishlists.entity';
import { Product } from '../products/entities/product.entity';
import { OrderEntity } from '../order/entities/order.entity';
import { Trip } from '../voyage/trips/entities/trip.entity';
import { UserEntity } from '../users/entities/user.entity';
import { ProductStatus } from '../products/enum/product.status.enum';
import { OrderStatus } from '../order/enum/order.status.enum';
import { ScheduleStatus } from '../voyage/vehicles/enum/schedule-status.enum';
import { ReservationVehicule } from '../voyage/reservations-vehicles/entities/reservations-vehicle.entity';
import { ReservationStatus } from '../voyage/reservations-vehicles/enum/reservation-status.enum';
import { PushNotificationHelper } from 'src/users/utility/helpers/push-notification.helper';
import { Shipment } from '../shipment/entity/shipment.entity';
import { ShipmentStatus } from '../shipment/enum/shipment.dto';
import { ShipmentTracking } from '../shipment/entity/shipment_tracking.entity';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { Service } from 'src/service/entities/service.entity';
import { RoomAvailability } from 'src/HotelRoomAvailability/entity/RoomAvailability.entity';
import { Reservation } from 'src/HotelRoomAvailability/entity/Reservation.entity';
import { PrestataireEntity } from 'src/service/entities/prestataires.entity';
import { ReservationStatus as HotelReservationStatus } from 'src/HotelRoomAvailability/enum/reservation-room.enum';
import { PrestataireStatus } from 'src/service/enum/prestataire-status.enum';
import { NotificationsService } from '../notification/notifications.service';
import { UserRole } from '../users/enum/user-role-enum';
import { CompanyType } from '../company/enum/type.company.enum';

/**
 * ✅ Notifications automatiques (rappels, nouveautés, promotions, voyages, colis, hôtels…) :
 * envoyées SEULEMENT aux personnes concernées (voir « LOGIQUE D'ENVOI » plus bas)
 * et SEULEMENT aux applications clients — x-platform mobile (ios / android) et web.
 * Jamais à Favor Driver (driver) ni aux back-offices (admin, group).
 * Réglable dans le .env : PUSH_CRON_CHANNELS=mobile,web
 */
const CRON_PUSH_CHANNELS: string[] = (process.env.PUSH_CRON_CHANNELS || 'mobile,web')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

@Injectable()
export class PushNotificationCronService {
    private static lastNewProductsRun: Date | null = null;
    private readonly logger = new Logger(PushNotificationCronService.name);
    private isRunning = false;
    private isRunningWishlist = false;
    private isRunningPendingOrders = false;
    private isRunningFeedback = false;
    private isRunningTripReminder = false;
    private isRunningPromotions = false;
    private isRunningAvailableTrips = false;
    private isRunningRecommendations = false;
    private isRunningShipmentReminder = false;
    private isRunningShippingPromo = false;
    private isRunningHomeDelivery = false;
    private isRunningNewLta = false;
    private isRunningPendingLta = false;
    private isRunningNewServices = false;
    private isRunningPopularServices = false;
    private isRunningHotelReminder = false;
    private isRunningHotelCheckout = false;
    private isRunningNewPrestataires = false;
    private isRunningCarPromotions = false;
    private isRunningFrequentProducts = false;
    private isRunningPhoneSync = false;

    private translations: Record<string, Record<string, string | ((params: any) => string)>> = {
        'common.today': { fr: 'aujourd\'hui', en: 'today', sw: 'leo', es: 'hoy', ar: 'اليوم' },
        'common.tomorrow': { fr: 'demain', en: 'tomorrow', sw: 'kesho', es: 'mañana', ar: 'غداً' },
        'common.departure': { fr: 'Départ', en: 'Departure', sw: 'Kuondoka', es: 'Salida', ar: 'المغادرة' },
        'common.arrival': { fr: 'Arrivée', en: 'Arrival', sw: 'Kuwasili', es: 'Llegada', ar: 'الوصول' },
        'common.hotel': { fr: 'notre hôtel', en: 'our hotel', sw: 'hoteli yetu', es: 'nuestro hotel', ar: 'فندقنا' },

        'cron.wishlist.title_new': { fr: 'Nouveaux favoris', en: 'New favorites', sw: 'Vipendwa vipya', es: 'Nuevos favoritos', ar: 'مفضلات جديدة' },
        'cron.wishlist.body_new': {
            fr: (p: any) => `Vous avez ajouté ${p.count} nouveau(x) produit(s) récemment. Ne les oubliez pas !`,
            en: (p: any) => `You added ${p.count} new product(s) recently. Don't forget them!`,
            sw: (p: any) => `Umeongeza bidhaa ${p.count} mpya hivi karibuni. Usizisahau!`,
            es: (p: any) => `¡Agregaste ${p.count} producto(s) nuevo(s) recientemente! No los olvides.`,
            ar: (p: any) => `لقد أضفت ${p.count} منتجاً جديداً مؤخراً. لا تنسها!`,
        },
        'cron.wishlist.title_old': { fr: 'Ça fait longtemps !', en: 'Long time!', sw: 'Muda mrefu!', es: '¡Mucho tiempo!', ar: 'منذ زمن طويل!' },
        'cron.wishlist.body_old': {
            fr: (p: any) => `Vos ${p.count} produits favoris sont toujours là. Profitez-en maintenant !`,
            en: (p: any) => `Your ${p.count} favorite products are still here. Take advantage now!`,
            sw: (p: any) => `Bidhaa zako ${p.count} unazozipenda bado zipo. Nufaika sasa!`,
            es: (p: any) => `Tus ${p.count} productos favoritos siguen ahí. ¡Aprovéchalos ahora!`,
            ar: (p: any) => `منتجاتك المفضلة البالغ عددها ${p.count} لا تزال موجودة. استفد منها الآن!`,
        },
        'cron.wishlist.title_default': { fr: 'Vos produits favoris', en: 'Your favorite products', sw: 'Bidhaa zako unazozipenda', es: 'Tus productos favoritos', ar: 'منتجاتك المفضلة' },
        'cron.wishlist.body_single': {
            fr: (p: any) => `${p.productName} est dans votre wishlist. Pensez à l'acheter !`,
            en: (p: any) => `${p.productName} is in your wishlist. Think about buying it!`,
            sw: (p: any) => `${p.productName} iko kwenye orodha yako ya matakwa. Fikiria kuinunua!`,
            es: (p: any) => `${p.productName} está en tu lista de deseos. ¡Piensa en comprarlo!`,
            ar: (p: any) => `${p.productName} موجود في قائمة رغباتك. فكر في شرائه!`,
        },
        'cron.wishlist.body_multiple': {
            fr: (p: any) => {
                const extra = p.remaining > 0 ? ` et ${p.remaining} autres` : '';
                return `Vous avez ${p.count} produits dans votre wishlist : ${p.names}${extra}`;
            },
            en: (p: any) => {
                const extra = p.remaining > 0 ? ` and ${p.remaining} others` : '';
                return `You have ${p.count} products in your wishlist: ${p.names}${extra}`;
            },
            sw: (p: any) => {
                const extra = p.remaining > 0 ? ` na ${p.remaining} nyingine` : '';
                return `Una bidhaa ${p.count} kwenye orodha yako ya matakwa: ${p.names}${extra}`;
            },
            es: (p: any) => {
                const extra = p.remaining > 0 ? ` y ${p.remaining} más` : '';
                return `Tienes ${p.count} productos en tu lista de deseos: ${p.names}${extra}`;
            },
            ar: (p: any) => {
                const extra = p.remaining > 0 ? ` و ${p.remaining} أخرى` : '';
                return `لديك ${p.count} منتجاً في قائمة رغباتك: ${p.names}${extra}`;
            },
        },
        'cron.wishlist.discount_suffix': { fr: ' Certains sont en promotion !', en: ' Some are on sale!', sw: ' Baadhi ziko kwenye punguzo!', es: ' ¡Algunos están en oferta!', ar: ' بعضها عليه تخفيضات!' },

        'cron.pending_orders.title': { fr: 'Action requise', en: 'Action required', sw: 'Hatua inahitajika', es: 'Acción requerida', ar: 'إجراء مطلوب' },
        'cron.pending_orders.body_single': {
            fr: (p: any) => `Votre commande ${p.invoiceNumber} est toujours en attente de validation.`,
            en: (p: any) => `Your order ${p.invoiceNumber} is still pending validation.`,
            sw: (p: any) => `Agizo lako ${p.invoiceNumber} bado linasubiri uthibitisho.`,
            es: (p: any) => `Tu pedido ${p.invoiceNumber} aún está pendiente de validación.`,
            ar: (p: any) => `طلبك ${p.invoiceNumber} لا يزال قيد الانتظار للمصادقة.`,
        },
        'cron.pending_orders.body_multiple': {
            fr: (p: any) => `Vous avez ${p.count} commandes en attente de validation.`,
            en: (p: any) => `You have ${p.count} orders pending validation.`,
            sw: (p: any) => `Una maagizo ${p.count} yanayosubiri uthibitisho.`,
            es: (p: any) => `Tienes ${p.count} pedidos pendientes de validación.`,
            ar: (p: any) => `لديك ${p.count} طلباً في انتظار المصادقة.`,
        },

        'cron.feedback.title': { fr: 'Partager votre expérience', en: 'Share your experience', sw: 'Shiriki uzoefu wako', es: 'Comparte tu experiencia', ar: 'شارك تجربتك' },
        'cron.feedback.body': {
            fr: (p: any) => `Votre commande ${p.invoiceNumber} vous a-t-elle plu ? Donnez votre avis !`,
            en: (p: any) => `Did you like your order ${p.invoiceNumber}? Give your review!`,
            sw: (p: any) => `Je, ulipenda agizo lako ${p.invoiceNumber}? Toa maoni yako!`,
            es: (p: any) => `¿Te gustó tu pedido ${p.invoiceNumber}? ¡Da tu opinión!`,
            ar: (p: any) => `هل أعجبك طلبك ${p.invoiceNumber}؟ قدم رأيك!`,
        },

        'cron.trip_reminder.title': { fr: 'Rappel de voyage', en: 'Trip reminder', sw: 'Kumbusho la safari', es: 'Recordatorio de viaje', ar: 'تذكير بالرحلة' },
        'cron.trip_reminder.body': {
            fr: (p: any) => `Rappel: Votre voyage ${p.departure} → ${p.arrival} part demain à ${p.time}. Préparez-vous !`,
            en: (p: any) => `Reminder: Your trip ${p.departure} → ${p.arrival} leaves tomorrow at ${p.time}. Get ready!`,
            sw: (p: any) => `Kumbusho: Safari yako ${p.departure} → ${p.arrival} inaondoka kesho saa ${p.time}. Jiandae!`,
            es: (p: any) => `Recordatorio: Tu viaje ${p.departure} → ${p.arrival} sale mañana a las ${p.time}. ¡Prepárate!`,
            ar: (p: any) => `تذكير: رحلتك ${p.departure} → ${p.arrival} تغادر غداً الساعة ${p.time}. استعد!`,
        },

        'cron.new_products.title': { fr: 'Nouveautés FavorHelp', en: 'FavorHelp new arrivals', sw: 'Bidhaa mpya FavorHelp', es: 'Novedades FavorHelp', ar: 'الوافدون الجدد إلى FavorHelp' },
        'cron.new_products.body_single': {
            fr: (p: any) => `Nouveau produit: ${p.productName} chez ${p.companyName}`,
            en: (p: any) => `New product: ${p.productName} at ${p.companyName}`,
            sw: (p: any) => `Bidhaa mpya: ${p.productName} kwa ${p.companyName}`,
            es: (p: any) => `Nuevo producto: ${p.productName} en ${p.companyName}`,
            ar: (p: any) => `منتج جديد: ${p.productName} لدى ${p.companyName}`,
        },
        'cron.new_products.body_multiple': {
            fr: (p: any) => `${p.count} nouveaux produits disponibles sur FavorHelp ! Découvrez-les dès maintenant.`,
            en: (p: any) => `${p.count} new products available on FavorHelp! Discover them now.`,
            sw: (p: any) => `Bidhaa mpya ${p.count} zinapatikana kwenye FavorHelp! Zigundue sasa.`,
            es: (p: any) => `¡${p.count} nuevos productos disponibles en FavorHelp! Descúbrelos ahora.`,
            ar: (p: any) => `${p.count} منتجاً جديداً متاحاً على FavorHelp! اكتشفها الآن.`,
        },

        'cron.promotions.title': { fr: 'Offres spéciales', en: 'Special offers', sw: 'Ofa maalum', es: 'Ofertas especiales', ar: 'عروض خاصة' },
        'cron.promotions.body': {
            fr: (p: any) => `Promotions en cours: ${p.promos}. Ne manquez pas ces offres !`,
            en: (p: any) => `Current promotions: ${p.promos}. Don't miss these offers!`,
            sw: (p: any) => `Mapunguzo yanayoendelea: ${p.promos}. Usikose ofa hizi!`,
            es: (p: any) => `Promociones actuales: ${p.promos}. ¡No te pierdas estas ofertas!`,
            ar: (p: any) => `العروض الحالية: ${p.promos}. لا تفوت هذه الفرص!`,
        },

        'cron.available_trips.title': { fr: 'Voyages disponibles', en: 'Available trips', sw: 'Safari zinazopatikana', es: 'Viajes disponibles', ar: 'رحلات متاحة' },
        'cron.available_trips.body': {
            fr: (p: any) => `${p.count} voyages disponibles cette semaine au départ de: ${p.cities}. Réservez votre place !`,
            en: (p: any) => `${p.count} trips available this week departing from: ${p.cities}. Book your seat!`,
            sw: (p: any) => `Safari ${p.count} zinapatikana wiki hii zikiondoka: ${p.cities}. Weka nafasi yako!`,
            es: (p: any) => `${p.count} viajes disponibles esta semana con salida desde: ${p.cities}. ¡Reserva tu asiento!`,
            ar: (p: any) => `${p.count} رحلة متاحة هذا الأسبوع تنطلق من: ${p.cities}. احجز مقعدك!`,
        },

        'cron.recommendations.title_by_category': { fr: 'Basé sur vos achats', en: 'Based on your purchases', sw: 'Kulingana na ununuzi wako', es: 'Basado en tus compras', ar: 'بناءً على مشترياتك' },
        'cron.recommendations.body_by_category': {
            fr: (p: any) => `Vous aimez ${p.category} ? Découvrez ${p.product1} et ${p.product2} !`,
            en: (p: any) => `You like ${p.category}? Discover ${p.product1} and ${p.product2}!`,
            sw: (p: any) => `Unapenda ${p.category}? Gundua ${p.product1} na ${p.product2}!`,
            es: (p: any) => `¿Te gusta ${p.category}? ¡Descubre ${p.product1} y ${p.product2}!`,
            ar: (p: any) => `هل تحب ${p.category}؟ اكتشف ${p.product1} و ${p.product2}!`,
        },
        'cron.recommendations.title_by_product': { fr: 'Comme vous avez aimé', en: 'Because you liked', sw: 'Kwa vile ulipenda', es: 'Como te gustó', ar: 'لأنك أعجبت بـ' },
        'cron.recommendations.body_by_product': {
            fr: (p: any) => `Après ${p.product}, découvrez ${p.recommended} qui pourrait vous plaire !`,
            en: (p: any) => `After ${p.product}, discover ${p.recommended} that might interest you!`,
            sw: (p: any) => `Baada ya ${p.product}, gundua ${p.recommended} ambayo inaweza kukupendeza!`,
            es: (p: any) => `Después de ${p.product}, ¡descubre ${p.recommended} que podría gustarte!`,
            ar: (p: any) => `بعد ${p.product}، اكتشف ${p.recommended} الذي قد يعجبك!`,
        },
        'cron.recommendations.title_default': { fr: 'Suggestions pour vous', en: 'Suggestions for you', sw: 'Mapendekezo kwako', es: 'Sugerencias para ti', ar: 'اقتراحات لك' },
        'cron.recommendations.body_default_small': {
            fr: (p: any) => `Découvrez ${p.names} spécialement sélectionnés pour vous.`,
            en: (p: any) => `Discover ${p.names} specially selected for you.`,
            sw: (p: any) => `Gundua ${p.names} zilizochaguliwa mahsusi kwako.`,
            es: (p: any) => `Descubre ${p.names} especialmente seleccionados para ti.`,
            ar: (p: any) => `اكتشف ${p.names} المختارة خصيصاً لك.`,
        },
        'cron.recommendations.body_default_large': {
            fr: (p: any) => `Découvrez ${p.names} et ${p.remaining} autres produits spécialement sélectionnés pour vous.`,
            en: (p: any) => `Discover ${p.names} and ${p.remaining} other products specially selected for you.`,
            sw: (p: any) => `Gundua ${p.names} na bidhaa ${p.remaining} zilizochaguliwa mahsusi kwako.`,
            es: (p: any) => `Descubre ${p.names} y otros ${p.remaining} productos especialmente seleccionados para ti.`,
            ar: (p: any) => `اكتشف ${p.names} و ${p.remaining} منتجاً آخر مختاراً خصيصاً لك.`,
        },
        'cron.recommendations.discount_suffix': { fr: ' Profitez-en, certains sont en promotion !', en: ' Take advantage, some are on sale!', sw: ' Nufaika, baadhi ziko kwenye punguzo!', es: ' ¡Aprovecha, algunos están en oferta!', ar: ' اغتنم الفرصة، بعضها عليه تخفيضات!' },

        'cron.shipment_reminder.title': { fr: 'Suivi de vos colis', en: 'Parcel tracking', sw: 'Ufuatiliaji wa mifuko yako', es: 'Seguimiento de tus paquetes', ar: 'تتبع طرودك' },
        'cron.shipment_reminder.body_single': {
            fr: (p: any) => `Votre colis ${p.trackingNumber} est en cours. Suivez son évolution dans l'application.`,
            en: (p: any) => `Your parcel ${p.trackingNumber} is in progress. Track its progress in the app.`,
            sw: (p: any) => `Mfuko wako ${p.trackingNumber} unaendelea. Fuata maendeleo yake kwenye programu.`,
            es: (p: any) => `Tu paquete ${p.trackingNumber} está en curso. Sigue su evolución en la aplicación.`,
            ar: (p: any) => `طردك ${p.trackingNumber} قيد التنفيذ. تتبع تقدمه في التطبيق.`,
        },
        'cron.shipment_reminder.body_multiple': {
            fr: (p: any) => `Vous avez ${p.count} colis en cours. Suivez leur progression en temps réel.`,
            en: (p: any) => `You have ${p.count} parcels in progress. Track their progress in real time.`,
            sw: (p: any) => `Una mifuko ${p.count} inayoendelea. Fuata maendeleo yao kwa wakati halisi.`,
            es: (p: any) => `Tienes ${p.count} paquetes en curso. Sigue su progreso en tiempo real.`,
            ar: (p: any) => `لديك ${p.count} طرداً قيد التنفيذ. تتبع تقدمها في الوقت الفعلي.`,
        },

        'cron.shipping_promo.title': { fr: 'Offres spéciales expédition', en: 'Special shipping offers', sw: 'Ofa maalum za usafirishaji', es: 'Ofertas especiales de envío', ar: 'عروض شحن خاصة' },
        'cron.shipping_promo.body': {
            fr: 'Expédiez vers RDC, Dubaï, Chine ou Afrique de l\'Ouest à prix réduit ! Tarifs spéciaux cette semaine. Contactez-nous pour un devis.',
            en: 'Ship to DRC, Dubai, China or West Africa at reduced prices! Special rates this week. Contact us for a quote.',
            sw: 'Safirisha hadi DRC, Dubai, Uchina au Afrika Magharibi kwa bei iliyopunguzwa! Bei maalum wiki hii. Wasiliana nasi kwa makadirio.',
            es: '¡Envía a RDC, Dubái, China o África Occidental a precios reducidos! Tarifas especiales esta semana. Contáctanos para un presupuesto.',
            ar: 'اشحن إلى الكونغو الديمقراطية، دبي، الصين أو غرب أفريقيا بأسعار مخفضة! أسعار خاصة هذا الأسبوع. اتصل بنا للحصول على عرض سعر.',
        },

        'cron.home_delivery.title': { fr: 'Livraison à domicile disponible', en: 'Home delivery available', sw: 'Uwasilishaji nyumbani unapatikana', es: 'Entrega a domicilio disponible', ar: 'التوصيل إلى المنزل متاح' },
        'cron.home_delivery.body_single': {
            fr: (p: any) => `Votre colis ${p.trackingNumber} est prêt pour livraison à domicile. Planifiez votre réception dès maintenant.`,
            en: (p: any) => `Your parcel ${p.trackingNumber} is ready for home delivery. Schedule your reception now.`,
            sw: (p: any) => `Mfuko wako ${p.trackingNumber} uko tayari kwa uwasilishaji nyumbani. Panga upokeaji wako sasa.`,
            es: (p: any) => `Tu paquete ${p.trackingNumber} está listo para entrega a domicilio. Programa tu recepción ahora.`,
            ar: (p: any) => `طردك ${p.trackingNumber} جاهز للتوصيل إلى المنزل. جدِّد استلامك الآن.`,
        },
        'cron.home_delivery.body_multiple': {
            fr: (p: any) => `${p.count} de vos colis sont prêts pour livraison à domicile. Organisez leur réception.`,
            en: (p: any) => `${p.count} of your parcels are ready for home delivery. Organize their reception.`,
            sw: (p: any) => `Mifuko yako ${p.count} iko tayari kwa uwasilishaji nyumbani. Panga upokeaji wao.`,
            es: (p: any) => `${p.count} de tus paquetes están listos para entrega a domicilio. Organiza su recepción.`,
            ar: (p: any) => `${p.count} من طرودك جاهزة للتوصيل إلى المنزل. نظّم استلامها.`,
        },

        'cron.new_lta_routes.title': { fr: 'Nouveaux itinéraires internationaux', en: 'New international routes', sw: 'Njia mpya za kimataifa', es: 'Nuevas rutas internacionales', ar: 'مسارات دولية جديدة' },
        'cron.new_lta_routes.body': {
            fr: (p: any) => `Nouvelles liaisons disponibles : ${p.destinations}. Expédiez vos marchandises vers RDC, Dubaï, Chine et Afrique de l'Ouest à des tarifs compétitifs.`,
            en: (p: any) => `New connections available: ${p.destinations}. Ship your goods to DRC, Dubai, China and West Africa at competitive rates.`,
            sw: (p: any) => `Viunganisho vipya vinapatikana: ${p.destinations}. Safirisha bidhaa zako hadi DRC, Dubai, Uchina na Afrika Magharibi kwa viwango vya ushindani.`,
            es: (p: any) => `Nuevas conexiones disponibles: ${p.destinations}. Envía tus mercancías a RDC, Dubái, China y África Occidental a precios competitivos.`,
            ar: (p: any) => `اتصالات جديدة متاحة: ${p.destinations}. اشحن بضائعك إلى الكونغو الديمقراطية، دبي، الصين وغرب أفريقيا بأسعار تنافسية.`,
        },

        'cron.pending_lta.title': { fr: 'LTA en attente', en: 'LTA pending', sw: 'LTA inasubiri', es: 'LTA pendiente', ar: 'LTA في انتظار المعالجة' },
        'cron.pending_lta.body': {
            fr: (p: any) => `Vous avez ${p.count} LTA en attente de traitement. Finalisez-les pour accélérer les expéditions.`,
            en: (p: any) => `You have ${p.count} LTAs pending processing. Finalize them to speed up shipments.`,
            sw: (p: any) => `Una LTA ${p.count} zinasubiri kuchakatwa. Zikamilishe ili kuharakisha usafirishaji.`,
            es: (p: any) => `Tienes ${p.count} LTA pendientes de procesamiento. Finalízalos para acelerar los envíos.`,
            ar: (p: any) => `لديك ${p.count} LTA في انتظار المعالجة. أنهِها لتسريع الشحنات.`,
        },

        'cron.new_services.title': { fr: 'Nouveaux services', en: 'New services', sw: 'Huduma mpya', es: 'Nuevos servicios', ar: 'خدمات جديدة' },
        'cron.new_services.body': {
            fr: (p: any) => `${p.count} nouveau(x) service(s) disponible(s) : ${p.categories}. Découvrez-les dès maintenant !`,
            en: (p: any) => `${p.count} new service(s) available: ${p.categories}. Discover them now!`,
            sw: (p: any) => `Huduma mpya ${p.count} zinapatikana: ${p.categories}. Zigundue sasa!`,
            es: (p: any) => `${p.count} nuevo(s) servicio(s) disponible(s): ${p.categories}. ¡Descúbrelos ahora!`,
            ar: (p: any) => `${p.count} خدمة جديدة متاحة: ${p.categories}. اكتشفها الآن!`,
        },

        'cron.popular_services.title': { fr: 'Services tendance', en: 'Trending services', sw: 'Huduma maarufu', es: 'Servicios populares', ar: 'خدمات رائجة' },
        'cron.popular_services.body': {
            fr: (p: any) => `Services populaires : ${p.services}. Réservez dès maintenant !`,
            en: (p: any) => `Popular services: ${p.services}. Book now!`,
            sw: (p: any) => `Huduma maarufu: ${p.services}. Weka nafasi sasa!`,
            es: (p: any) => `Servicios populares: ${p.services}. ¡Reserva ahora!`,
            ar: (p: any) => `الخدمات الرائجة: ${p.services}. احجز الآن!`,
        },

        'cron.hotel_reminder.title_today': { fr: 'Check-in aujourd’hui', en: 'Check-in today', sw: 'Kuingia leo', es: 'Check-in hoy', ar: 'تسجيل الدخول اليوم' },
        'cron.hotel_reminder.title_upcoming': { fr: 'Rappel réservation', en: 'Booking reminder', sw: 'Kumbusho la nafasi', es: 'Recordatorio de reserva', ar: 'تذكير بالحجز' },
        'cron.hotel_reminder.body_single': {
            fr: (p: any) => `Votre réservation à ${p.hotelName} commence ${p.day}. Préparez votre séjour !`,
            en: (p: any) => `Your booking at ${p.hotelName} starts ${p.day}. Prepare your stay!`,
            sw: (p: any) => `Nafasi yako katika ${p.hotelName} inaanza ${p.day}. Jiandae kwa kukaa kwako!`,
            es: (p: any) => `Tu reserva en ${p.hotelName} comienza ${p.day}. ¡Prepara tu estancia!`,
            ar: (p: any) => `حجزك في ${p.hotelName} يبدأ ${p.day}. جهّز إقامتك!`,
        },
        'cron.hotel_reminder.body_multiple': {
            fr: (p: any) => `Vous avez ${p.count} réservations d'hôtel qui commencent ${p.day}. Bon séjour !`,
            en: (p: any) => `You have ${p.count} hotel bookings starting ${p.day}. Enjoy your stay!`,
            sw: (p: any) => `Una nafasi ${p.count} za hoteli zinazoanza ${p.day}. Furahia kukaa kwako!`,
            es: (p: any) => `Tienes ${p.count} reservas de hotel que comienzan ${p.day}. ¡Disfruta tu estancia!`,
            ar: (p: any) => `لديك ${p.count} حجوزات فندقية تبدأ ${p.day}. إقامة سعيدة!`,
        },

        'cron.hotel_checkout.title': { fr: 'Check-out demain', en: 'Check-out tomorrow', sw: 'Ondoka kesho', es: 'Check-out mañana', ar: 'موعد المغادرة غداً' },
        'cron.hotel_checkout.body': {
            fr: (p: any) => `Votre séjour à ${p.hotelName} se termine demain. Pensez à libérer la chambre avant midi.`,
            en: (p: any) => `Your stay at ${p.hotelName} ends tomorrow. Remember to check out before noon.`,
            sw: (p: any) => `Kukaa kwako katika ${p.hotelName} kunaisha kesho. Kumbuka kuondoka kabla ya saa sita mchana.`,
            es: (p: any) => `Tu estancia en ${p.hotelName} termina mañana. Recuerda hacer el check-out antes del mediodía.`,
            ar: (p: any) => `إقامتك في ${p.hotelName} تنتهي غداً. تذكر مغادرة الغرفة قبل الظهر.`,
        },

        'cron.new_prestataires.title': { fr: 'Nouveaux prestataires', en: 'New providers', sw: 'Watoa huduma wapya', es: 'Nuevos proveedores', ar: 'مقدمو خدمات جدد' },
        'cron.new_prestataires.body': {
            fr: (p: any) => `${p.count} nouveau(x) prestataire(s) : ${p.specialties}. Découvrez leurs services !`,
            en: (p: any) => `${p.count} new provider(s): ${p.specialties}. Discover their services!`,
            sw: (p: any) => `Watoa huduma wapya ${p.count}: ${p.specialties}. Gundua huduma zao!`,
            es: (p: any) => `${p.count} nuevo(s) proveedor(es): ${p.specialties}. ¡Descubre sus servicios!`,
            ar: (p: any) => `${p.count} مقدِّم خدمات جديد: ${p.specialties}. اكتشف خدماتهم!`,
        },

        'cron.car_promotion.title': {
            fr: '🚗 Voitures en promotion',
            en: '🚗 Cars on sale',
            sw: '🚗 Magari kwenye punguzo',
            es: '🚗 Coches en oferta',
            ar: '🚗 سيارات للبيع'
        },
        'cron.car_promotion.body_single': {
            fr: (p: any) => `Découvrez ${p.model} ${p.year} à ${p.price} ${p.currency} chez ${p.company}.`,
            en: (p: any) => `Discover ${p.model} ${p.year} at ${p.price} ${p.currency} from ${p.company}.`,
            sw: (p: any) => `Gundua ${p.model} ${p.year} kwa ${p.price} ${p.currency} kutoka ${p.company}.`,
            es: (p: any) => `Descubre ${p.model} ${p.year} por ${p.price} ${p.currency} de ${p.company}.`,
            ar: (p: any) => `اكتشف ${p.model} ${p.year} بسعر ${p.price} ${p.currency} من ${p.company}.`
        },
        'cron.car_promotion.body_multiple': {
            fr: (p: any) => `${p.count} voitures disponibles dès ${p.minPrice} ${p.currency}. Ne les ratez pas !`,
            en: (p: any) => `${p.count} cars available from ${p.minPrice} ${p.currency}. Don't miss them!`,
            sw: (p: any) => `Magari ${p.count} yanapatikana kuanzia ${p.minPrice} ${p.currency}. Usiyakose!`,
            es: (p: any) => `${p.count} coches disponibles desde ${p.minPrice} ${p.currency}. ¡No los pierdas!`,
            ar: (p: any) => `${p.count} سيارة متاحة بسعر يبدأ من ${p.minPrice} ${p.currency}. لا تفوتها!`
        },

        'cron.frequent_products.title': {
            fr: 'Vos produits préférés',
            en: 'Your favorite products',
            sw: 'Bidhaa unazozipenda',
            es: 'Tus productos favoritos',
            ar: 'منتجاتك المفضلة'
        },
        'cron.frequent_products.body_single': {
            fr: (p: any) => `Vous avez commandé "${p.productName}" ${p.count} fois. Commandez-le à nouveau !`,
            en: (p: any) => `You ordered "${p.productName}" ${p.count} times. Order it again!`,
            sw: (p: any) => `Umeagiza "${p.productName}" mara ${p.count}. Agiza tena!`,
            es: (p: any) => `Pediste "${p.productName}" ${p.count} veces. ¡Pídelo de nuevo!`,
            ar: (p: any) => `لقد طلبت "${p.productName}" ${p.count} مرة. اطلبه مرة أخرى!`
        },
        'cron.frequent_products.body_multiple': {
            fr: (p: any) => `Vos produits les plus commandés : ${p.names}. Profitez de nos offres !`,
            en: (p: any) => `Your most ordered products: ${p.names}. Take advantage of our offers!`,
            sw: (p: any) => `Bidhaa zako ulizoagiza mara nyingi: ${p.names}. Nufaika na ofa zetu!`,
            es: (p: any) => `Tus productos más pedidos: ${p.names}. ¡Aprovecha nuestras ofertas!`,
            ar: (p: any) => `منتجاتك الأكثر طلباً: ${p.names}. استفد من عروضنا!`
        }
        ,

        'cron.phone_missing.title': {
            fr: 'Complétez votre profil',
            en: 'Complete your profile',
            sw: 'Kamilisha wasifu wako',
            es: 'Complete su perfil',
            ar: 'أكمل ملفك الشخصي',
        },
        'cron.phone_missing.body': {
            fr: 'Votre profil est incomplet. Ajoutez votre numéro de téléphone pour faciliter vos commandes et livraisons.',
            en: 'Your profile is incomplete. Add your phone number to facilitate your orders and deliveries.',
            sw: 'Wasifu wako haujakamilika. Ongeza nambari yako ya simu ili kuwezesha maagizo na usafirishaji wako.',
            es: 'Su perfil está incompleto. Agregue su número de teléfono para facilitar sus pedidos y entregas.',
            ar: 'ملفك الشخصي غير مكتمل. أضف رقم هاتفك لتسهيل طلباتك وعمليات التسليم.',
        },
        'cron.phone_synced.title': {
            fr: 'Numéro de téléphone ajouté',
            en: 'Phone number added',
            sw: 'Nambari ya simu imeongezwa',
            es: 'Número de teléfono añadido',
            ar: 'تمت إضافة رقم الهاتف',
        },
        'cron.phone_synced.body': {
            fr: (p: any) => `Votre numéro de téléphone ${p.phone} a été automatiquement ajouté à votre profil.`,
            en: (p: any) => `Your phone number ${p.phone} has been automatically added to your profile.`,
            sw: (p: any) => `Nambari yako ya simu ${p.phone} imeongezwa kiotomatiki kwenye wasifu wako.`,
            es: (p: any) => `Su número de teléfono ${p.phone} ha sido añadido automáticamente a su perfil.`,
            ar: (p: any) => `تمت إضافة رقم هاتفك ${p.phone} تلقائياً إلى ملفك الشخصي.`,
        },
    };

    private t(key: string, lang: string, params?: any): string {
        const translation =
            this.translations[key]?.[lang] ?? this.translations[key]?.['en'] ?? this.translations[key]?.['fr'];
        if (!translation) {
            console.warn(`Missing translation for key: ${key}, lang: ${lang}`);
            return key;
        }
        if (typeof translation === 'function') {
            return translation(params);
        }
        return translation;
    }

    // Méthode sécurisée pour envoyer une notification (évite les titres/corps vides)
    private async safeSendNotification(
        userId: string,
        title: string,
        body: string,
        imageUrl?: string,
        pushData?: Record<string, string>
    ): Promise<void> {
        if (!title || !body) {
            this.logger.error(`[safeSendNotification] Notification ignorée pour user ${userId}: title="${title}", body="${body}"`);
            return;
        }
        await this.pushNotificationHelper.sendAll({
            userId,
            pushTitle: title,
            pushBody: body,
            imageUrl,
            pushData,
            // ✅ Seulement les applications clients (mobile, web) — pas driver, admin, group
            pushChannels: CRON_PUSH_CHANNELS,
        });
    }

    // ============================================================
    // ✅ LOGIQUE D'ENVOI : chaque notification va SEULEMENT aux personnes concernées
    // ============================================================
    //
    //  1. Rappels personnels (commande en attente, avis, voyage, colis, hôtel) : uniquement le client concerné,
    //     une seule fois par événement (fenêtre de temps), s'il accepte les notifications push.
    //  2. Notifications promotionnelles (nouveautés, promotions, voyages, services, voitures, favoris…) :
    //       • seulement les CLIENTS (rôle CUSTOMER — jamais admins, livreurs, chauffeurs) ;
    //       • seulement s'ils acceptent les notifications push ET promotionnelles (user_settings) ;
    //       • seulement si c'est pertinent pour eux : même ville (ou pays) que l'offre, et lié à ce
    //         qu'ils achètent / mettent en favoris (catégorie ou type de produit) ;
    //       • au plus UNE notification promotionnelle par période (PUSH_MARKETING_MIN_HOURS, 20 h par défaut).
    //
    //  .env :
    //    PUSH_MARKETING_ROLES=CUSTOMER        rôles qui reçoivent les promotions
    //    PUSH_MARKETING_MIN_HOURS=20           délai minimum entre deux promotions pour un même client (0 = sans limite)
    //    PUSH_INTEREST_DAYS=180                historique pris en compte pour les centres d'intérêt
    //    PUSH_MARKETING_ENABLED=true           false = coupe toutes les notifications promotionnelles

    private get marketingEnabled(): boolean {
        return String(process.env.PUSH_MARKETING_ENABLED ?? 'true').toLowerCase() !== 'false';
    }

    private get marketingRoles(): string[] {
        return (process.env.PUSH_MARKETING_ROLES || UserRole.CUSTOMER)
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean);
    }

    private get marketingMinHours(): number {
        const v = Number(process.env.PUSH_MARKETING_MIN_HOURS ?? 20);
        return Number.isFinite(v) && v >= 0 ? v : 20;
    }

    private get interestSince(): Date {
        const days = Math.max(7, Number(process.env.PUSH_INTEREST_DAYS ?? 180) || 180);
        return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    }

    /** Plateformes des applications clients (device_tokens.platform) */
    private get clientPlatforms(): string[] {
        const out: string[] = [];
        if (CRON_PUSH_CHANNELS.includes('mobile')) out.push('ios', 'android', 'mobile');
        if (CRON_PUSH_CHANNELS.includes('web')) out.push('web');
        return out.length ? out : ['ios', 'android', 'mobile', 'web'];
    }

    /** « Goma » = « goma » = « GOMA » ; accents ignorés */
    private norm(v?: string | null): string {
        return String(v ?? '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '');
    }

    private langOf(user?: UserEntity | null): string {
        return String(user?.settings?.language || 'fr').split('-')[0];
    }

    private chunk<T>(list: T[], size = 500): T[][] {
        const out: T[][] = [];
        for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
        return out;
    }

    /**
     * ✅ Clients pouvant recevoir une notification PROMOTIONNELLE :
     * rôle client, compte actif, push + promotions acceptés, appareil d'une application client,
     * pas de promotion reçue depuis PUSH_MARKETING_MIN_HOURS.
     * `userIds` : limiter à ces utilisateurs (ex. ceux qui ont déjà expédié un colis).
     */
    private async marketingAudience(userIds?: string[]): Promise<UserEntity[]> {
        if (!this.marketingEnabled) return [];
        if (userIds && !userIds.length) return [];
        const since = new Date(Date.now() - this.marketingMinHours * 60 * 60 * 1000);
        const run = (ids?: string[]) => {
            const qb = this.userRepository
                .createQueryBuilder('u')
                .leftJoinAndSelect('u.settings', 'settings')
                .innerJoinAndSelect('u.deviceTokens', 'dt')
                .where('u.isActive = 1')
                .andWhere('u.deleted = 0')
                .andWhere('u.role IN (:...roles)', { roles: this.marketingRoles })
                .andWhere('(settings.id IS NULL OR settings.pushNotifications = 1)')
                .andWhere('(settings.id IS NULL OR settings.marketingNotifications = 1)')
                .andWhere('(dt.platform IS NULL OR LOWER(dt.platform) IN (:...plats))', { plats: this.clientPlatforms });
            if (this.marketingMinHours > 0) {
                qb.andWhere('(settings.id IS NULL OR settings.lastMarketingPushAt IS NULL OR settings.lastMarketingPushAt < :since)', { since });
            }
            if (ids) qb.andWhere('u.id IN (:...ids)', { ids });
            return qb.getMany();
        };
        if (!userIds) return run();
        const out: UserEntity[] = [];
        for (const part of this.chunk([...new Set(userIds)])) out.push(...(await run(part)));
        return out;
    }

    /** Le client vient de recevoir une promotion : il n'en recevra pas d'autre avant PUSH_MARKETING_MIN_HOURS */
    private async markMarketingSent(userId: string): Promise<void> {
        try {
            await this.userRepository.manager.query(
                'INSERT INTO `user_settings` (`id`, `user_id`, `last_marketing_push_at`) VALUES (UUID(), ?, NOW()) ' +
                    'ON DUPLICATE KEY UPDATE `last_marketing_push_at` = NOW()',
                [userId],
            );
        } catch (e: any) {
            this.logger.warn(`Plafond promotions non enregistré (${userId}) : ${e?.message}`);
        }
    }

    /** Envoi d'une notification PROMOTIONNELLE (puis plafond) */
    private async sendMarketing(
        user: UserEntity,
        title: string,
        body: string,
        imageUrl?: string,
        pushData?: Record<string, string>,
    ): Promise<boolean> {
        if (!title || !body) return false;
        await this.safeSendNotification(user.id, title, body, imageUrl, pushData);
        await this.markMarketingSent(user.id);
        return true;
    }

    /**
     * ✅ Centres d'intérêt de chaque client (commandes + favoris récents) :
     * types de produit (SHOP, CAR, RESTAURANT…), catégories, produits en favoris.
     */
    private async interestProfiles(userIds: string[]): Promise<
        Map<string, { types: Set<string>; categories: Set<string>; wishlist: Set<string>; hasHistory: boolean }>
    > {
        const map = new Map<string, { types: Set<string>; categories: Set<string>; wishlist: Set<string>; hasHistory: boolean }>();
        const get = (id: string) => {
            let p = map.get(id);
            if (!p) {
                p = { types: new Set(), categories: new Set(), wishlist: new Set(), hasHistory: false };
                map.set(id, p);
            }
            return p;
        };
        for (const ids of this.chunk([...new Set(userIds)])) {
            if (!ids.length) continue;
            const orders = await this.orderRepository
                .createQueryBuilder('o')
                .leftJoin('o.orderItems', 'i')
                .leftJoin('i.product', 'p')
                .leftJoin('p.category', 'c')
                .select('o.userId', 'userId')
                .addSelect('o.type', 'type')
                .addSelect('c.id', 'categoryId')
                .where('o.userId IN (:...ids)', { ids })
                .andWhere('o.createdAt >= :since', { since: this.interestSince })
                .getRawMany();
            for (const r of orders) {
                const p = get(r.userId);
                p.hasHistory = true;
                if (r.type) p.types.add(String(r.type));
                if (r.categoryId) p.categories.add(String(r.categoryId));
            }
            const wishes = await this.wishlistRepository
                .createQueryBuilder('w')
                .innerJoin('w.user', 'u')
                .innerJoin('w.product', 'p')
                .leftJoin('p.category', 'c')
                .select('u.id', 'userId')
                .addSelect('p.id', 'productId')
                .addSelect('p.type', 'type')
                .addSelect('c.id', 'categoryId')
                .where('u.id IN (:...ids)', { ids })
                .andWhere('w.deleted = 0')
                .getRawMany();
            for (const r of wishes) {
                const p = get(r.userId);
                p.hasHistory = true;
                if (r.type) p.types.add(String(r.type));
                if (r.categoryId) p.categories.add(String(r.categoryId));
                if (r.productId) p.wishlist.add(String(r.productId));
            }
        }
        return map;
    }

    /** Clients ayant déjà utilisé un service (commandes de ce type de produit) */
    private async usersWhoOrderedTypes(types: string[]): Promise<string[]> {
        const rows = await this.orderRepository
            .createQueryBuilder('o')
            .select('DISTINCT o.userId', 'userId')
            .where('o.type IN (:...types)', { types })
            .andWhere('o.createdAt >= :since', { since: this.interestSince })
            .getRawMany();
        return rows.map((r) => r.userId).filter(Boolean);
    }

    /**
     * ✅ L'offre est-elle dans la zone du client ?
     * Ville du client connue → même ville ; sinon pays connu → même pays ; sinon null (zone inconnue).
     */
    private sameArea(user: UserEntity, cityName?: string | null, countryName?: string | null): boolean | null {
        const uc = this.norm(user.city);
        const uk = this.norm(user.country);
        if (uc) return !!cityName && this.norm(cityName) === uc;
        if (uk) return !!countryName && this.norm(countryName) === uk;
        return null;
    }

    /**
     * ✅ Règle de pertinence d'une offre (produit, service, voiture) pour un client :
     *  - hors de sa zone → non ;
     *  - client avec historique → seulement si l'offre correspond à ses types de produit ou catégories ;
     *  - nouveau client (sans historique) → seulement si l'offre est dans sa zone (connue).
     */
    private isRelevant(
        user: UserEntity,
        profile: { types: Set<string>; categories: Set<string>; hasHistory: boolean } | undefined,
        item: { type?: string | null; categoryId?: string | null; city?: string | null; country?: string | null },
    ): boolean {
        const area = this.sameArea(user, item.city, item.country);
        if (area === false) return false;
        if (profile?.hasHistory) {
            return (!!item.type && profile.types.has(String(item.type))) || (!!item.categoryId && profile.categories.has(String(item.categoryId)));
        }
        return area === true;
    }

    constructor(
        @InjectRepository(DeviceToken)
        private deviceTokenRepository: Repository<DeviceToken>,
        @InjectRepository(Wishlist)
        private wishlistRepository: Repository<Wishlist>,
        @InjectRepository(Product)
        private productRepository: Repository<Product>,
        @InjectRepository(OrderEntity)
        private orderRepository: Repository<OrderEntity>,
        @InjectRepository(Trip)
        private tripRepository: Repository<Trip>,
        @InjectRepository(UserEntity)
        private userRepository: Repository<UserEntity>,
        @InjectRepository(ReservationVehicule)
        private reservationRepository: Repository<ReservationVehicule>,
        @InjectRepository(Shipment)
        private shipmentRepository: Repository<Shipment>,
        @InjectRepository(LtaEntity)
        private ltaRepository: Repository<LtaEntity>,
        @InjectRepository(ShipmentTracking)
        private trackingRepository: Repository<ShipmentTracking>,
        @InjectRepository(Service)
        private serviceRepository: Repository<Service>,
        @InjectRepository(RoomAvailability)
        private roomAvailabilityRepository: Repository<RoomAvailability>,
        @InjectRepository(Reservation)
        private hotelReservationRepository: Repository<Reservation>,
        @InjectRepository(PrestataireEntity)
        private prestataireRepository: Repository<PrestataireEntity>,
        private pushNotificationHelper: PushNotificationHelper,
        private notificationsService: NotificationsService,
    ) { }

    // ==================== RAPPEL WISHLIST (9h et 18h) ====================
    @Cron(CronExpression.EVERY_DAY_AT_9AM)
    @Cron('0 18 * * *')
    async remindWishlistProducts() {
        if (this.isRunningWishlist) {
            this.logger.warn('remindWishlistProducts already running, skipping');
            return;
        }
        this.isRunningWishlist = true;
        const notifiedUsers = new Set<string>();
        try {
            this.logger.log('Début du rappel des produits en wishlist');
            const wishlists = await this.wishlistRepository.find({
                relations: ['user', 'user.deviceTokens', 'user.settings', 'product', 'product.category', 'product.images'],
                where: { deleted: false },
            });
            const userWishlists = new Map<string, { products: Product[]; addedAt: Date[] }>();
            for (const wish of wishlists) {
                // ✅ Seulement les produits encore en vente
                if (!wish.user || !wish.product || wish.product.status !== ProductStatus.PUBLISHED) continue;
                const userData = userWishlists.get(wish.user.id);
                if (!userData) {
                    userWishlists.set(wish.user.id, {
                        products: [wish.product],
                        addedAt: [wish.createdAt]
                    });
                } else {
                    userData.products.push(wish.product);
                    userData.addedAt.push(wish.createdAt);
                }
            }
            // ✅ Clients qui acceptent les promotions, sans promotion reçue récemment
            const eligible = new Map((await this.marketingAudience([...userWishlists.keys()])).map((u) => [u.id, u]));
            let sentCount = 0;
            for (const [userId, { products, addedAt }] of userWishlists) {
                if (products.length === 0 || notifiedUsers.has(userId)) continue;
                const user = eligible.get(userId);
                if (!user?.deviceTokens?.length) continue;
                const rawLang = user.settings?.language || 'fr';
                const lang = rawLang.split('-')[0];
                const threeDaysAgo = new Date();
                threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
                const recentAdded = addedAt.filter(date => date > threeDaysAgo).length;
                const oldestAdded = Math.min(...addedAt.map(d => d.getTime()));
                const daysInWishlist = Math.floor((Date.now() - oldestAdded) / (1000 * 60 * 60 * 24));
                let title = '', body = '';
                if (recentAdded > 0) {
                    title = this.t('cron.wishlist.title_new', lang);
                    body = this.t('cron.wishlist.body_new', lang, { count: recentAdded });
                } else if (daysInWishlist > 7) {
                    title = this.t('cron.wishlist.title_old', lang);
                    body = this.t('cron.wishlist.body_old', lang, { count: products.length });
                } else {
                    title = this.t('cron.wishlist.title_default', lang);
                    const productNames = products.slice(0, 2).map(p => p.name).join(', ');
                    if (products.length === 1) {
                        body = this.t('cron.wishlist.body_single', lang, { productName: productNames });
                    } else {
                        body = this.t('cron.wishlist.body_multiple', lang, {
                            count: products.length,
                            names: productNames,
                            remaining: products.length > 2 ? products.length - 2 : 0,
                        });
                    }
                }
                const hasDiscount = products.some(p =>
                    p.status === ProductStatus.PUBLISHED &&
                    p.detail !== undefined && p.detail !== null &&
                    p.detail_price_original !== undefined &&
                    p.detail_price_original !== null &&
                    p.detail < p.detail_price_original
                );
                if (hasDiscount) body += this.t('cron.wishlist.discount_suffix', lang);
                const firstProduct = products[0];
                const imageUrl = firstProduct?.images?.[0]?.url;
                await this.sendMarketing(user, title, body, imageUrl, {
                    entity: 'WISHLIST',
                    entityId: user.id,
                    action: 'REMIND',
                    count: String(products.length),
                    recentAdded: String(recentAdded),
                });
                notifiedUsers.add(userId);
                sentCount++;
            }
            this.logger.log(`Rappel wishlist envoyé à ${sentCount} utilisateurs`);
        } catch (error) {
            this.logger.error('Erreur rappel wishlist:', error);
        } finally {
            this.isRunningWishlist = false;
        }
    }

    // ==================== COMMANDES EN ATTENTE ====================
    @Cron('0 10,16 * * *')
    async remindPendingOrders() {
        if (this.isRunningPendingOrders) {
            this.logger.warn('remindPendingOrders already running, skipping');
            return;
        }
        this.isRunningPendingOrders = true;
        const notifiedUsers = new Set<string>();
        try {
            this.logger.log('Vérification des commandes en attente');
            // ✅ Rappel UNE journée seulement (commande en attente depuis 24 à 48 h) : pas de rappel sans fin
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
            const pendingOrders = await this.orderRepository.find({
                where: [{ status: OrderStatus.PENDING, createdAt: Between(twoDaysAgo, yesterday) }],
                relations: [
                    'user',
                    'user.deviceTokens',
                    'user.settings',
                    'orderItems',                          // ✅ AJOUTER
                    'orderItems.product',                  // ✅ AJOUTER
                    'orderItems.product.images',           // ✅ AJOUTER
                ],
            });
            const userPending = new Map<string, OrderEntity[]>();
            for (const order of pendingOrders) {
                if (!order.user) continue;
                const userOrders = userPending.get(order.userId) || [];
                userOrders.push(order);
                userPending.set(order.userId, userOrders);
            }
            let sentCount = 0;
            for (const [userId, orders] of userPending) {
                if (notifiedUsers.has(userId)) continue;
                const user = orders[0].user;
                if (!user?.deviceTokens?.length) continue;
                const rawLang = user.settings?.language || 'fr';
                const lang = rawLang.split('-')[0];
                const count = orders.length;
                let body = '';
                if (count === 1) {
                    body = this.t('cron.pending_orders.body_single', lang, { invoiceNumber: orders[0].invoiceNumber });
                } else {
                    body = this.t('cron.pending_orders.body_multiple', lang, { count });
                }
                const title = this.t('cron.pending_orders.title', lang);

                // ✅ RÉCUPÉRER L'IMAGE DU PREMIER PRODUIT
                let imageUrl: string | undefined;
                const firstOrder = orders[0];
                if (firstOrder.orderItems?.length) {
                    const firstItem = firstOrder.orderItems[0];
                    if (firstItem.product?.images?.length) {
                        imageUrl = firstItem.product.images[0].url;
                    } else if (firstItem.product?.image) {
                        imageUrl = firstItem.product.image;
                    }
                }

                await this.safeSendNotification(userId, title, body, imageUrl, {   // ✅ imageUrl
                    entity: 'ORDER',
                    entityId: orders[0].id,
                    action: 'PENDING_REMIND',
                    count: String(count),
                });
                notifiedUsers.add(userId);
                sentCount++;
            }
            this.logger.log(`Rappels commandes envoyés à ${sentCount} utilisateurs`);
        } catch (error) {
            this.logger.error('Erreur rappel commandes:', error);
        } finally {
            this.isRunningPendingOrders = false;
        }
    }

    // ==================== DEMANDE D'AVIS ====================
    @Cron('0 14 * * *')
    async askForFeedback() {
        if (this.isRunningFeedback) {
            this.logger.warn('askForFeedback already running, skipping');
            return;
        }
        this.isRunningFeedback = true;
        const notifiedUsers = new Set<string>();
        try {
            this.logger.log('Vérification des commandes livrées sans avis');
            // ✅ Une seule demande d'avis par commande : livrée il y a 2 à 3 jours (la tâche passe une fois par jour)
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
            const deliveredOrders = await this.orderRepository.find({
                where: { status: OrderStatus.DELIVERED, deliveredAt: Between(threeDaysAgo, twoDaysAgo) },
                relations: [
                    'user',
                    'user.deviceTokens',
                    'user.settings',
                    'orderItems',                          // ✅ AJOUTER
                    'orderItems.product',                  // ✅ AJOUTER
                    'orderItems.product.images',           // ✅ AJOUTER
                ],
            });
            const userDelivered = new Map<string, OrderEntity[]>();
            for (const order of deliveredOrders) {
                if (!order.user) continue;
                const list = userDelivered.get(order.userId) || [];
                list.push(order);
                userDelivered.set(order.userId, list);
            }
            let sentCount = 0;
            for (const [userId, orders] of userDelivered) {
                if (notifiedUsers.has(userId)) continue;
                const user = orders[0].user;
                if (!user?.deviceTokens?.length) continue;
                const rawLang = user.settings?.language || 'fr';
                const lang = rawLang.split('-')[0];
                const order = orders[0];
                const title = this.t('cron.feedback.title', lang);
                const body = this.t('cron.feedback.body', lang, { invoiceNumber: order.invoiceNumber });

                // ✅ RÉCUPÉRER L'IMAGE DU PREMIER PRODUIT
                let imageUrl: string | undefined;
                if (order.orderItems?.length) {
                    const firstItem = order.orderItems[0];
                    if (firstItem.product?.images?.length) {
                        imageUrl = firstItem.product.images[0].url;
                    } else if (firstItem.product?.image) {
                        imageUrl = firstItem.product.image;
                    }
                }

                await this.safeSendNotification(userId, title, body, imageUrl, {   // ✅ imageUrl
                    entity: 'ORDER',
                    entityId: order.id,
                    action: 'FEEDBACK_REQUEST',
                    orderId: order.id,
                });
                notifiedUsers.add(userId);
                sentCount++;
            }
            this.logger.log(`Demandes d'avis envoyées à ${sentCount} utilisateurs`);
        } catch (error) {
            this.logger.error('Erreur demande d\'avis:', error);
        } finally {
            this.isRunningFeedback = false;
        }
    }

    // ==================== RAPPEL RÉSERVATIONS VOYAGE ====================
    @Cron('0 8 * * *')
    async remindTripReservations() {
        if (this.isRunningTripReminder) {
            this.logger.warn('remindTripReservations already running, skipping');
            return;
        }
        this.isRunningTripReminder = true;
        const notifiedUsers = new Set<string>();
        try {
            this.logger.log('Vérification des réservations de voyage');
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            const dayAfter = new Date(tomorrow);
            dayAfter.setDate(dayAfter.getDate() + 1);
            const upcomingReservations = await this.reservationRepository.find({
                where: { status: ReservationStatus.CONFIRMED },
                relations: ['user', 'user.deviceTokens', 'user.settings', 'trip', 'trip.segments'],
            });
            const filteredReservations = upcomingReservations.filter(res => {
                const tripDate = res.trip?.departure_datetime;
                return tripDate && tripDate >= tomorrow && tripDate < dayAfter;
            });
            let sentCount = 0;
            for (const reservation of filteredReservations) {
                const user = reservation.user;
                if (!user?.deviceTokens?.length || notifiedUsers.has(user.id)) continue;
                const rawLang = user.settings?.language || 'fr';
                const lang = rawLang.split('-')[0];
                const firstSegment = reservation.trip.segments?.[0];
                const lastSegment = reservation.trip.segments?.[reservation.trip.segments.length - 1];
                const departure = firstSegment?.departure_city || this.t('common.departure', lang);
                const arrival = lastSegment?.arrival_city || this.t('common.arrival', lang);
                const time = firstSegment?.departure_datetime?.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) || '';
                const title = this.t('cron.trip_reminder.title', lang);
                const body = this.t('cron.trip_reminder.body', lang, { departure, arrival, time });
                await this.safeSendNotification(user.id, title, body, undefined, {
                    entity: 'RESERVATION',
                    entityId: reservation.id,
                    action: 'REMINDER',
                    reservationId: reservation.id,
                });
                notifiedUsers.add(user.id);
                sentCount++;
            }
            this.logger.log(`Rappels voyage envoyés à ${sentCount} utilisateurs`);
        } catch (error) {
            this.logger.error('Erreur rappel réservations voyage:', error);
        } finally {
            this.isRunningTripReminder = false;
        }
    }

    // ==================== NOUVEAUX PRODUITS ====================
    // ✅ Seulement les clients de la même ville (ou pays) que la boutique, intéressés par ce type / cette catégorie
    @Cron('0 9 * * *')
    async notifyNewProducts() {
        if (this.isRunning) {
            this.logger.warn('notifyNewProducts already running, skipping');
            return;
        }
        this.isRunning = true;
        try {
            this.logger.log('Vérification des nouveaux produits');
            const since = PushNotificationCronService.lastNewProductsRun || new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
            const newProducts = await this.productRepository.find({
                where: { createdAt: MoreThan(since), status: ProductStatus.PUBLISHED },
                relations: ['company', 'company.city', 'company.country', 'category', 'images'],
                order: { createdAt: 'DESC' },
            });
            PushNotificationCronService.lastNewProductsRun = new Date();
            this.logger.log(`Nouveaux produits depuis ${since.toISOString()} : ${newProducts.length}`);
            if (newProducts.length === 0) return;

            const users = await this.marketingAudience();
            const profiles = await this.interestProfiles(users.map((u) => u.id));
            let sentCount = 0;
            for (const user of users) {
                const mine = newProducts.filter((p) =>
                    this.isRelevant(user, profiles.get(user.id), {
                        type: p.type,
                        categoryId: p.category?.id,
                        city: p.company?.city?.name,
                        country: p.company?.country?.name,
                    }),
                );
                if (!mine.length) continue;
                const lang = this.langOf(user);
                const first = mine[0];
                const body =
                    mine.length === 1
                        ? this.t('cron.new_products.body_single', lang, {
                            productName: first.name,
                            companyName: first.company?.companyName || 'FavorHelp',
                        })
                        : this.t('cron.new_products.body_multiple', lang, { count: mine.length });
                const ok = await this.sendMarketing(user, this.t('cron.new_products.title', lang), body, first.images?.[0]?.url, {
                    entity: 'PRODUCT',
                    entityId: mine.length === 1 ? first.id : 'multiple',
                    action: 'NEW',
                    count: String(mine.length),
                });
                if (ok) sentCount++;
            }
            this.logger.log(`Nouveaux produits : ${sentCount} client(s) concerné(s) notifié(s) (sur ${users.length} éligibles)`);
        } catch (error) {
            this.logger.error('Erreur générale dans notifyNewProducts:', error);
        } finally {
            this.isRunning = false;
        }
    }

    // ==================== PROMOTIONS ====================
    // ✅ 1) baisse de prix d'un produit EN FAVORI ; 2) sinon promotions de sa ville, dans ses centres d'intérêt
    @Cron(CronExpression.EVERY_DAY_AT_NOON)
    async notifyPromotions() {
        if (this.isRunningPromotions) {
            this.logger.warn('notifyPromotions already running, skipping');
            return;
        }
        this.isRunningPromotions = true;
        try {
            this.logger.log('Vérification des promotions');
            const productsOnSale = await this.productRepository.find({
                where: { status: ProductStatus.PUBLISHED },
                relations: ['company', 'company.city', 'company.country', 'category', 'images'],
            });
            const discountOf = (p: Product) => ((p.detail_price_original! - p.detail!) / p.detail_price_original!) * 100;
            const discounted = productsOnSale
                .filter(
                    (p) =>
                        p.detail !== undefined && p.detail !== null &&
                        p.detail_price_original !== undefined && p.detail_price_original !== null &&
                        p.detail_price_original > 0 && p.detail < p.detail_price_original,
                )
                .sort((a, b) => discountOf(b) - discountOf(a));
            if (discounted.length === 0) return;

            const users = await this.marketingAudience();
            const profiles = await this.interestProfiles(users.map((u) => u.id));
            let sentCount = 0;
            for (const user of users) {
                const profile = profiles.get(user.id);
                const fromWishlist = discounted.filter((p) => profile?.wishlist.has(p.id));
                const mine = (fromWishlist.length
                    ? fromWishlist
                    : discounted.filter((p) =>
                        this.isRelevant(user, profile, {
                            type: p.type,
                            categoryId: p.category?.id,
                            city: p.company?.city?.name,
                            country: p.company?.country?.name,
                        }),
                    )
                ).slice(0, 3);
                if (!mine.length) continue;
                const lang = this.langOf(user);
                const promos = mine.map((p) => `${p.name} (-${Math.round(discountOf(p))}%)`).join(', ');
                const ok = await this.sendMarketing(user, this.t('cron.promotions.title', lang), this.t('cron.promotions.body', lang, { promos }), mine[0].images?.[0]?.url, {
                    entity: 'PRODUCT',
                    entityId: mine[0].id,
                    action: fromWishlist.length ? 'WISHLIST_PRICE_DROP' : 'PROMOTION',
                    count: String(mine.length),
                });
                if (ok) sentCount++;
            }
            this.logger.log(`Promotions : ${sentCount} client(s) concerné(s) notifié(s)`);
        } catch (error) {
            this.logger.error('Erreur notification promotions:', error);
        } finally {
            this.isRunningPromotions = false;
        }
    }

    // ==================== VOYAGES DISPONIBLES ====================
    // ✅ Seulement les clients qui voyagent avec Favor (réservation dans l'historique),
    //    pour les départs de LEUR ville (ou des villes d'où ils sont déjà partis). Une fois par jour.
    @Cron('0 12 * * *')
    async notifyAvailableTrips() {
        if (this.isRunningAvailableTrips) {
            this.logger.warn('notifyAvailableTrips already running, skipping');
            return;
        }
        this.isRunningAvailableTrips = true;
        try {
            this.logger.log('Vérification des voyages disponibles');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const nextWeek = new Date(today);
            nextWeek.setDate(nextWeek.getDate() + 7);
            const trips = await this.tripRepository.find({
                where: { departure_datetime: Between(today, nextWeek), status: ScheduleStatus.SCHEDULED },
                relations: ['company', 'segments', 'vehicle'],
                order: { departure_datetime: 'ASC' },
            });
            if (trips.length === 0) return;

            // Voyageurs : réservations récentes → villes de départ habituelles
            const rows = await this.reservationRepository
                .createQueryBuilder('r')
                .innerJoin('r.user', 'u')
                .leftJoin('r.trip', 't')
                .leftJoin('t.segments', 's')
                .select('u.id', 'userId')
                .addSelect('s.departure_city', 'city')
                .where('r.reservation_date >= :since', { since: this.interestSince })
                .getRawMany();
            const usualCities = new Map<string, Set<string>>();
            for (const r of rows) {
                if (!r.userId) continue;
                const set = usualCities.get(r.userId) || new Set<string>();
                if (r.city) set.add(this.norm(r.city));
                usualCities.set(r.userId, set);
            }
            const users = await this.marketingAudience([...usualCities.keys()]);
            let sentCount = 0;
            for (const user of users) {
                const cities = new Set(usualCities.get(user.id) || []);
                if (user.city) cities.add(this.norm(user.city));
                const mine = trips.filter((tr) => cities.has(this.norm(tr.segments?.[0]?.departure_city)));
                if (!mine.length) continue;
                const byCity = new Map<string, number>();
                for (const tr of mine) {
                    const c = tr.segments?.[0]?.departure_city;
                    if (c) byCity.set(c, (byCity.get(c) || 0) + 1);
                }
                const cityList = [...byCity.entries()]
                    .slice(0, 3)
                    .map(([city, count]) => `${city} (${count} départ${count > 1 ? 's' : ''})`)
                    .join(', ');
                const lang = this.langOf(user);
                const ok = await this.sendMarketing(
                    user,
                    this.t('cron.available_trips.title', lang),
                    this.t('cron.available_trips.body', lang, { count: mine.length, cities: cityList }),
                    undefined,
                    { entity: 'TRIP', entityId: mine[0].id, action: 'AVAILABLE', count: String(mine.length) },
                );
                if (ok) sentCount++;
            }
            this.logger.log(`Voyages : ${sentCount} voyageur(s) concerné(s) notifié(s)`);
        } catch (error) {
            this.logger.error('Erreur notification voyages:', error);
        } finally {
            this.isRunningAvailableTrips = false;
        }
    }

    // ==================== RECOMMANDATIONS PERSONNALISÉES ====================
    @Cron('0 10 * * 1,4')
    async personalizedRecommendations() {
        if (this.isRunningRecommendations) {
            this.logger.warn('personalizedRecommendations already running, skipping');
            return;
        }
        this.isRunningRecommendations = true;
        const notifiedUsers = new Set<string>();
        try {
            this.logger.log('Génération de recommandations basées sur l\'historique d\'achat');
            const activeUsers = await this.orderRepository
                .createQueryBuilder('order')
                .select('order.userId', 'userId')
                .addSelect('COUNT(*)', 'orderCount')
                .where('order.status IN (:...statuses)', { statuses: [OrderStatus.DELIVERED, OrderStatus.COMPLETED] })
                .groupBy('order.userId')
                .having('COUNT(*) >= 2')
                .getRawMany();
            // ✅ Clients qui acceptent les promotions, sans promotion reçue récemment
            const eligibleRecos = new Map((await this.marketingAudience(activeUsers.map((a) => a.userId))).map((u) => [u.id, u]));
            let sentCount = 0;
            for (const { userId } of activeUsers) {
                if (notifiedUsers.has(userId) || !eligibleRecos.has(userId)) continue;
                // Récupération des catégories et produits favoris (code inchangé)
                const favoriteCategories = await this.orderRepository
                    .createQueryBuilder('order')
                    .leftJoin('order.orderItems', 'item')
                    .leftJoin('item.product', 'product')
                    .leftJoin('product.category', 'category')
                    .select('category.id', 'categoryId')
                    .addSelect('category.name', 'categoryName')
                    .addSelect('COUNT(*)', 'purchaseCount')
                    .where('order.userId = :userId', { userId })
                    .andWhere('order.status IN (:...statuses)', { statuses: [OrderStatus.DELIVERED, OrderStatus.COMPLETED] })
                    .andWhere('category.id IS NOT NULL')
                    .groupBy('category.id')
                    .orderBy('purchaseCount', 'DESC')
                    .limit(3)
                    .getRawMany();
                const favoriteProducts = await this.orderRepository
                    .createQueryBuilder('order')
                    .leftJoin('order.orderItems', 'item')
                    .leftJoin('item.product', 'product')
                    .select('product.id', 'productId')
                    .addSelect('product.name', 'productName')
                    .addSelect('COUNT(*)', 'purchaseCount')
                    .where('order.userId = :userId', { userId })
                    .andWhere('order.status IN (:...statuses)', { statuses: [OrderStatus.DELIVERED, OrderStatus.COMPLETED] })
                    .andWhere('product.id IS NOT NULL')
                    .groupBy('product.id')
                    .orderBy('purchaseCount', 'DESC')
                    .limit(5)
                    .getRawMany();
                if (favoriteCategories.length === 0 && favoriteProducts.length === 0) continue;
                const purchasedProductIds = favoriteProducts.map(p => p.productId).filter(Boolean);
                let recommendedProducts: Product[] = [];
                if (favoriteCategories.length > 0) {
                    const categoryIds = favoriteCategories.map(c => c.categoryId).filter(Boolean);
                    if (categoryIds.length > 0) {
                        recommendedProducts = await this.productRepository.find({
                            where: {
                                category: { id: In(categoryIds) },
                                status: ProductStatus.PUBLISHED,
                                ...(purchasedProductIds.length > 0 && { id: Not(In(purchasedProductIds)) }),
                            },
                            relations: ['category', 'company'],
                            take: 5,
                            order: { createdAt: 'DESC' },
                        });
                    }
                }
                if (recommendedProducts.length < 3) {
                    const excludeIds = [...purchasedProductIds, ...recommendedProducts.map(p => p.id)];
                    const popularProducts = await this.productRepository.find({
                        where: {
                            status: ProductStatus.PUBLISHED,
                            ...(excludeIds.length > 0 && { id: Not(In(excludeIds)) }),
                        },
                        take: 5 - recommendedProducts.length,
                        order: { createdAt: 'DESC' },
                    });
                    recommendedProducts.push(...popularProducts);
                }
                if (recommendedProducts.length === 0) continue;
                const user = eligibleRecos.get(userId);
                if (!user?.deviceTokens?.length) continue;
                const rawLang = user.settings?.language || 'fr';
                const lang = rawLang.split('-')[0];
                const topCategory = favoriteCategories[0]?.categoryName || '';
                const topProduct = favoriteProducts[0]?.productName || '';
                let title = '', body = '';
                if (topCategory && recommendedProducts.length >= 2) {
                    title = this.t('cron.recommendations.title_by_category', lang);
                    body = this.t('cron.recommendations.body_by_category', lang, {
                        category: topCategory,
                        product1: recommendedProducts[0].name,
                        product2: recommendedProducts[1].name,
                    });
                } else if (topProduct) {
                    title = this.t('cron.recommendations.title_by_product', lang);
                    body = this.t('cron.recommendations.body_by_product', lang, {
                        product: topProduct,
                        recommended: recommendedProducts[0].name,
                    });
                } else {
                    title = this.t('cron.recommendations.title_default', lang);
                    const productNames = recommendedProducts.slice(0, 2).map(p => p.name).join(' et ');
                    if (recommendedProducts.length <= 2) {
                        body = this.t('cron.recommendations.body_default_small', lang, { names: productNames });
                    } else {
                        body = this.t('cron.recommendations.body_default_large', lang, {
                            names: productNames,
                            remaining: recommendedProducts.length - 2,
                        });
                    }
                }
                const hasDiscount = recommendedProducts.some(p => p.detail && p.detail_price_original && p.detail < p.detail_price_original);
                if (hasDiscount) body += this.t('cron.recommendations.discount_suffix', lang);
                await this.sendMarketing(user, title, body, undefined, {
                    entity: 'PRODUCT',
                    entityId: recommendedProducts[0]?.id || 'recommendation',
                    action: 'RECOMMENDATION',
                    category: topCategory,
                    productCount: String(recommendedProducts.length),
                });
                notifiedUsers.add(userId);
                sentCount++;
            }
            this.logger.log(`Recommandations personnalisées envoyées à ${sentCount} utilisateurs`);
        } catch (error) {
            this.logger.error('Erreur recommandations personnalisées:', error);
        } finally {
            this.isRunningRecommendations = false;
        }
    }

    // ==================== PHONE MANQUANT — SYNCHRONISATION & NOTIFICATION ====================
    @Cron('0 0 0 * * *')   // Toutes les 24h (minuit)
    async syncMissingPhones() {
        if (this.isRunningPhoneSync) {
            this.logger.warn('syncMissingPhones already running, skipping');
            return;
        }
        this.isRunningPhoneSync = true;
        try {
            this.logger.log('Début synchronisation des phones manquants');

            // 1️⃣ Récupérer TOUS les users sans phone
            const usersWithoutPhone = await this.userRepository.find({
                where: [
                    { phone: IsNull() },
                    { phone: '' },
                ],
                select: ['id', 'fullName', 'email', 'phone'],
                relations: ['settings', 'deviceTokens'],
            });

            this.logger.log(`📋 ${usersWithoutPhone.length} user(s) sans phone`);

            let updatedCount = 0;
            let notifiedCount = 0;

            for (const user of usersWithoutPhone) {
                const rawLang = user.settings?.language || 'fr';
                const lang = rawLang.split('-')[0];

                try {
                    let foundPhone: string | null = null;

                    // 2️⃣ Chercher dans ORDERS (whatsapp_number)
                    const order = await this.orderRepository.findOne({
                        where: {
                            userId: user.id,
                            whatsapp_number: Not(IsNull()),
                        },
                        select: ['id', 'whatsapp_number'],
                        order: { createdAt: 'DESC' },
                    });

                    if (order?.whatsapp_number && order.whatsapp_number.trim() !== '') {
                        foundPhone = order.whatsapp_number.trim();
                    }

                    // 3️⃣ Sinon chercher dans SHIPMENTS
                    if (!foundPhone) {
                        const shipment = await this.shipmentRepository.findOne({
                            where: [
                                { userId: user.id, clientPhone: Not(IsNull()) },
                                { userId: user.id, fournisseurPhone: Not(IsNull()) },
                                { userId: user.id, pickupContactPhone: Not(IsNull()) },
                                { userId: user.id, deliveryContactPhone: Not(IsNull()) },
                            ],
                            select: [
                                'id',
                                'clientPhone',
                                'fournisseurPhone',
                                'pickupContactPhone',
                                'deliveryContactPhone',
                            ],
                            order: { createdAt: 'DESC' },
                        });

                        if (shipment) {
                            foundPhone =
                                (shipment.clientPhone && shipment.clientPhone.trim()) ||
                                (shipment.fournisseurPhone && shipment.fournisseurPhone.trim()) ||
                                (shipment.pickupContactPhone && shipment.pickupContactPhone.trim()) ||
                                (shipment.deliveryContactPhone && shipment.deliveryContactPhone.trim()) ||
                                null;
                        }
                    }

                    // 4️⃣ Si trouvé → mise à jour
                    if (foundPhone) {
                        const cleanPhone = this.normalizePhone(foundPhone);

                        if (cleanPhone) {
                            await this.userRepository.update(user.id, { phone: cleanPhone });
                            updatedCount++;

                            this.logger.log(`✅ User ${user.id} → phone: ${cleanPhone}`);

                            // Notifier le user (bonus)
                            if (user.deviceTokens?.length) {
                                const title = this.t('cron.phone_synced.title', lang);
                                const body = this.t('cron.phone_synced.body', lang, { phone: cleanPhone });

                                await this.safeSendNotification(user.id, title, body, undefined, {
                                    entity: 'USER',
                                    entityId: user.id,
                                    action: 'PHONE_SYNCED',
                                });
                            }
                        }
                    } else {
                        // 5️⃣ Aucun phone trouvé → notifier pour demander
                        if (user.deviceTokens?.length) {
                            const title = this.t('cron.phone_missing.title', lang);
                            const body = this.t('cron.phone_missing.body', lang);

                            await this.safeSendNotification(user.id, title, body, undefined, {
                                entity: 'USER',
                                entityId: user.id,
                                action: 'ADD_PHONE',
                                screen: 'ProfileEdit',
                            });
                            notifiedCount++;
                        }
                    }
                } catch (err: any) {
                    this.logger.error(`Erreur traitement user ${user.id}: ${err.message}`);
                }
            }

            this.logger.log(
                `🏁 Phone sync terminé → ${updatedCount} mis à jour, ${notifiedCount} notifiés`,
            );
        } catch (error) {
            this.logger.error('Erreur syncMissingPhones:', error);
        } finally {
            this.isRunningPhoneSync = false;
        }
    }

    /**
     * 🧹 Normalise un numéro de téléphone
     */
    private normalizePhone(raw: string): string | null {
        if (!raw) return null;

        let cleaned = raw.replace(/[^\d+]/g, '');
        cleaned = cleaned.replace(/\+/g, (match, offset) => (offset === 0 ? '+' : ''));

        const digitsOnly = cleaned.replace(/\D/g, '');
        if (digitsOnly.length < 8) return null;

        if (!cleaned.startsWith('+') && digitsOnly.length >= 10) {
            cleaned = '+' + cleaned;
        }

        return cleaned;
    }

    // ==================== NETTOYAGE TOKENS ====================
    @Cron('0 3 * * 0')
    async cleanup() {
        this.logger.log('Nettoyage des données');
        try {
            const sixtyDaysAgo = new Date();
            sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
            const deletedTokens = await this.deviceTokenRepository
                .createQueryBuilder()
                .delete()
                .where('updatedAt < :date', { date: sixtyDaysAgo })
                .execute();
            this.logger.log(`${deletedTokens.affected} tokens obsolètes supprimés`);
        } catch (error) {
            this.logger.error('Erreur nettoyage:', error);
        }
    }

    // ==================== RAPPEL COLIS ====================
    @Cron('0 9,18 * * *')
    async remindPendingShipments() {
        if (this.isRunningShipmentReminder) {
            this.logger.warn('remindPendingShipments already running, skipping');
            return;
        }
        this.isRunningShipmentReminder = true;
        const notifiedUsers = new Set<string>();
        try {
            this.logger.log('Vérification des colis en cours');
            const activeStatuses = [
                ShipmentStatus.PENDING,
                ShipmentStatus.PICKUP_ASSIGNED,
                ShipmentStatus.PICKUP_IN_PROGRESS,
                ShipmentStatus.PICKUP_COMPLETED,
                ShipmentStatus.AT_ORIGIN_AGENCY,
                ShipmentStatus.AWAITING_SHIPPING,
                ShipmentStatus.SHIPPING_IN_PROGRESS,
                ShipmentStatus.ARRIVED_DESTINATION,
                ShipmentStatus.READY_FOR_DELIVERY,
                ShipmentStatus.TRANSIT,
            ];
            const pendingShipments = await this.shipmentRepository.find({
                where: { status: In(activeStatuses) },
                relations: ['user', 'user.deviceTokens', 'user.settings'],
            });
            const userShipments = new Map<string, Shipment[]>();
            for (const shipment of pendingShipments) {
                if (!shipment.user) continue;
                const list = userShipments.get(shipment.user.id) || [];
                list.push(shipment);
                userShipments.set(shipment.user.id, list);
            }
            let sentCount = 0;
            for (const [userId, shipments] of userShipments) {
                if (notifiedUsers.has(userId)) continue;
                const user = shipments[0].user;
                if (!user?.deviceTokens?.length) continue;
                const rawLang = user.settings?.language || 'fr';
                const lang = rawLang.split('-')[0];
                const count = shipments.length;
                let body = '';
                if (count === 1) {
                    body = this.t('cron.shipment_reminder.body_single', lang, { trackingNumber: shipments[0].trackingNumber });
                } else {
                    body = this.t('cron.shipment_reminder.body_multiple', lang, { count });
                }
                const title = this.t('cron.shipment_reminder.title', lang);
                await this.safeSendNotification(userId, title, body, undefined, {
                    entity: 'SHIPMENT',
                    entityId: shipments[0].id,
                    action: 'REMIND',
                    count: String(count),
                });
                notifiedUsers.add(userId);
                sentCount++;
            }
            this.logger.log(`Rappels colis envoyés à ${sentCount} utilisateurs`);
        } catch (error) {
            this.logger.error('Erreur rappel colis:', error);
        } finally {
            this.isRunningShipmentReminder = false;
        }
    }

    // ==================== PROMOTIONS EXPÉDITIONS ====================
    // ✅ Seulement les clients qui ont déjà expédié un colis avec Favor
    @Cron('0 8 * * 1')
    async notifyShippingPromotions() {
        if (this.isRunningShippingPromo) {
            this.logger.warn('notifyShippingPromotions already running, skipping');
            return;
        }
        this.isRunningShippingPromo = true;
        try {
            this.logger.log('Envoi des promotions expéditions');
            const shippers = await this.shipperIds();
            const users = await this.marketingAudience(shippers);
            let sentCount = 0;
            for (const user of users) {
                const lang = this.langOf(user);
                const ok = await this.sendMarketing(user, this.t('cron.shipping_promo.title', lang), this.t('cron.shipping_promo.body', lang), undefined, {
                    entity: 'PROMOTION',
                    action: 'SHIPPING',
                });
                if (ok) sentCount++;
            }
            this.logger.log(`Promotions expéditions : ${sentCount} expéditeur(s) notifié(s)`);
        } catch (error) {
            this.logger.error('Erreur promotions expéditions:', error);
        } finally {
            this.isRunningShippingPromo = false;
        }
    }

    /** Clients ayant expédié au moins un colis récemment */
    private async shipperIds(): Promise<string[]> {
        const rows = await this.shipmentRepository
            .createQueryBuilder('s')
            .select('DISTINCT s.userId', 'userId')
            .where('s.userId IS NOT NULL')
            .andWhere('s.createdAt >= :since', { since: this.interestSince })
            .getRawMany();
        return rows.map((r) => r.userId).filter(Boolean);
    }

    // ==================== LIVRAISON À DOMICILE ====================
    @Cron('0 14 * * *')
    async remindHomeDelivery() {
        if (this.isRunningHomeDelivery) {
            this.logger.warn('remindHomeDelivery already running, skipping');
            return;
        }
        this.isRunningHomeDelivery = true;
        const notifiedUsers = new Set<string>();
        try {
            this.logger.log('Vérification des colis prêts pour livraison à domicile');
            const readyForDelivery = await this.shipmentRepository.find({
                where: { status: ShipmentStatus.READY_FOR_DELIVERY },
                relations: ['user', 'user.deviceTokens', 'user.settings'],
            });
            const userMap = new Map<string, Shipment[]>();
            for (const shipment of readyForDelivery) {
                if (!shipment.user) continue;
                const list = userMap.get(shipment.user.id) || [];
                list.push(shipment);
                userMap.set(shipment.user.id, list);
            }
            let sentCount = 0;
            for (const [userId, shipments] of userMap) {
                if (notifiedUsers.has(userId)) continue;
                const user = shipments[0].user;
                if (!user?.deviceTokens?.length) continue;
                const rawLang = user.settings?.language || 'fr';
                const lang = rawLang.split('-')[0];
                const count = shipments.length;
                let body = '';
                if (count === 1) {
                    body = this.t('cron.home_delivery.body_single', lang, { trackingNumber: shipments[0].trackingNumber });
                } else {
                    body = this.t('cron.home_delivery.body_multiple', lang, { count });
                }
                const title = this.t('cron.home_delivery.title', lang);
                await this.safeSendNotification(userId, title, body, undefined, {
                    entity: 'SHIPMENT',
                    entityId: shipments[0].id,
                    action: 'DELIVERY_READY',
                    count: String(count),
                });
                notifiedUsers.add(userId);
                sentCount++;
            }
            this.logger.log(`Rappels livraison à domicile envoyés à ${sentCount} utilisateurs`);
        } catch (error) {
            this.logger.error('Erreur rappel livraison:', error);
        } finally {
            this.isRunningHomeDelivery = false;
        }
    }

    // ==================== NOUVELLES LTA ====================
    // ✅ Seulement les clients qui expédient des colis
    @Cron('0 8 * * *')
    async notifyNewLtaRoutes() {
        if (this.isRunningNewLta) {
            this.logger.warn('notifyNewLtaRoutes already running, skipping');
            return;
        }
        this.isRunningNewLta = true;
        try {
            this.logger.log('Vérification des nouvelles LTA');
            const lastWeek = new Date();
            lastWeek.setDate(lastWeek.getDate() - 7);
            const newLtas = await this.ltaRepository.find({
                where: { createdAt: MoreThan(lastWeek) },
                relations: ['shipper', 'consignee'],
            });
            if (newLtas.length === 0) return;
            const destinations = [...new Set(newLtas.map((l) => l.destination).filter(Boolean))];
            const destText = destinations.slice(0, 3).join(', ');
            const users = await this.marketingAudience(await this.shipperIds());
            let sentCount = 0;
            for (const user of users) {
                const lang = this.langOf(user);
                const ok = await this.sendMarketing(
                    user,
                    this.t('cron.new_lta_routes.title', lang),
                    this.t('cron.new_lta_routes.body', lang, { destinations: destText }),
                    undefined,
                    { entity: 'LTA', action: 'NEW_ROUTES', count: String(newLtas.length) },
                );
                if (ok) sentCount++;
            }
            this.logger.log(`Nouvelles LTA : ${sentCount} expéditeur(s) notifié(s)`);
        } catch (error) {
            this.logger.error('Erreur notification LTA:', error);
        } finally {
            this.isRunningNewLta = false;
        }
    }

    // ==================== LTA EN ATTENTE ====================
    // ✅ Chaque propriétaire d'entreprise reçoit le nombre de SES LTA en attente (pas le total général)
    @Cron('0 10 * * *')
    async remindPendingLta() {
        if (this.isRunningPendingLta) {
            this.logger.warn('remindPendingLta already running, skipping');
            return;
        }
        this.isRunningPendingLta = true;
        try {
            this.logger.log('Vérification des LTA en attente');
            const pendingLtas = await this.ltaRepository.find({
                where: { status: ShipmentStatus.PENDING },
                relations: ['shipper', 'consignee'],
            });
            if (pendingLtas.length === 0) return;
            const countByCompany = new Map<string, number>();
            for (const l of pendingLtas) {
                for (const id of [l.shipperId, l.consigneeId]) {
                    if (id) countByCompany.set(id, (countByCompany.get(id) || 0) + 1);
                }
            }
            const companyIds = [...countByCompany.keys()];
            if (!companyIds.length) return;
            const owners = await this.userRepository
                .createQueryBuilder('user')
                .innerJoinAndSelect('user.userHasCompany', 'uhc')
                .leftJoinAndSelect('uhc.company', 'company')
                .leftJoinAndSelect('user.settings', 'settings')
                .innerJoinAndSelect('user.deviceTokens', 'dt')
                .where('uhc.company IN (:...ids)', { ids: companyIds })
                .andWhere('uhc.isOwner = true')
                .andWhere('user.isActive = 1')
                .getMany();
            let sentCount = 0;
            for (const owner of owners) {
                const count = (owner as any).userHasCompany
                    ?.map((uhc: any) => countByCompany.get(uhc.company?.id) || 0)
                    .reduce((a: number, b: number) => a + b, 0);
                if (!count) continue;
                const lang = this.langOf(owner);
                await this.safeSendNotification(owner.id, this.t('cron.pending_lta.title', lang), this.t('cron.pending_lta.body', lang, { count }), undefined, {
                    entity: 'LTA',
                    action: 'PENDING_REMIND',
                    count: String(count),
                });
                sentCount++;
            }
            this.logger.log(`Rappels LTA envoyés à ${sentCount} propriétaire(s) concerné(s)`);
        } catch (error) {
            this.logger.error('Erreur rappel LTA:', error);
        } finally {
            this.isRunningPendingLta = false;
        }
    }

    // ==================== NOUVEAUX SERVICES ====================
    // ✅ Clients de la même ville que l'entreprise, qui utilisent déjà des services (ou nouveaux clients de la ville)
    @Cron('0 11 * * *')
    async notifyNewServices() {
        if (this.isRunningNewServices) {
            this.logger.warn('notifyNewServices already running, skipping');
            return;
        }
        this.isRunningNewServices = true;
        try {
            this.logger.log('Vérification des nouveaux services');
            const lastWeek = new Date();
            lastWeek.setDate(lastWeek.getDate() - 7);
            const newServices = await this.serviceRepository.find({
                where: { createdAt: MoreThan(lastWeek), status: ProductStatus.PUBLISHED },
                relations: ['company', 'company.city', 'company.country', 'category'],
            });
            if (newServices.length === 0) return;
            const users = await this.marketingAudience();
            const profiles = await this.interestProfiles(users.map((u) => u.id));
            let sentCount = 0;
            for (const user of users) {
                const mine = newServices.filter((s) =>
                    this.isRelevant(user, profiles.get(user.id), {
                        type: CompanyType.SERVICE,
                        categoryId: s.category?.id,
                        city: s.company?.city?.name,
                        country: s.company?.country?.name,
                    }),
                );
                if (!mine.length) continue;
                const categories = [...new Set(mine.map((s) => s.category?.name).filter(Boolean))].slice(0, 2).join(', ');
                const lang = this.langOf(user);
                const ok = await this.sendMarketing(
                    user,
                    this.t('cron.new_services.title', lang),
                    this.t('cron.new_services.body', lang, { count: mine.length, categories }),
                    undefined,
                    { entity: 'SERVICE', action: 'NEW', count: String(mine.length) },
                );
                if (ok) sentCount++;
            }
            this.logger.log(`Nouveaux services : ${sentCount} client(s) concerné(s) notifié(s)`);
        } catch (error) {
            this.logger.error('Erreur notification nouveaux services:', error);
        } finally {
            this.isRunningNewServices = false;
        }
    }

    // ==================== SERVICES POPULAIRES ====================
    // ✅ Seulement les clients qui utilisent déjà des services
    @Cron('0 15 * * 4')
    async notifyPopularServices() {
        if (this.isRunningPopularServices) {
            this.logger.warn('notifyPopularServices already running, skipping');
            return;
        }
        this.isRunningPopularServices = true;
        try {
            this.logger.log('Vérification des services populaires');
            const popularServices = await this.serviceRepository
                .createQueryBuilder('service')
                .leftJoin('service.prestataires', 'prestataire')
                .select('service.id', 'id')
                .addSelect('service.name', 'name')
                .addSelect('COUNT(prestataire.id)', 'prestataireCount')
                .where('service.status = :status', { status: ProductStatus.PUBLISHED })
                .groupBy('service.id')
                .orderBy('prestataireCount', 'DESC')
                .limit(3)
                .getRawMany();
            if (popularServices.length === 0) return;
            const users = await this.marketingAudience(await this.usersWhoOrderedTypes([CompanyType.SERVICE]));
            const serviceNames = popularServices.map((s) => s.name).join(', ');
            let sentCount = 0;
            for (const user of users) {
                const lang = this.langOf(user);
                const ok = await this.sendMarketing(
                    user,
                    this.t('cron.popular_services.title', lang),
                    this.t('cron.popular_services.body', lang, { services: serviceNames }),
                    undefined,
                    { entity: 'SERVICE', action: 'POPULAR', count: String(popularServices.length) },
                );
                if (ok) sentCount++;
            }
            this.logger.log(`Services populaires : ${sentCount} client(s) concerné(s) notifié(s)`);
        } catch (error) {
            this.logger.error('Erreur notification services populaires:', error);
        } finally {
            this.isRunningPopularServices = false;
        }
    }

    // ==================== RAPPEL RÉSERVATIONS HÔTEL ====================
    @Cron('0 7 * * *')
    async remindHotelReservations() {
        if (this.isRunningHotelReminder) {
            this.logger.warn('remindHotelReservations already running, skipping');
            return;
        }
        this.isRunningHotelReminder = true;
        const notifiedUsers = new Set<string>();
        try {
            this.logger.log('Vérification des réservations d’hôtel à venir');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toISOString().split('T')[0];
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];
            const upcomingReservations = await this.hotelReservationRepository.find({
                where: [
                    { startDate: todayStr, status: HotelReservationStatus.CONFIRMED },
                    { startDate: tomorrowStr, status: HotelReservationStatus.CONFIRMED },
                ],
                relations: ['user', 'user.deviceTokens', 'user.settings', 'product', 'product.company'],
            });
            const userReservations = new Map<string, Reservation[]>();
            for (const res of upcomingReservations) {
                if (!res.user) continue;
                const list = userReservations.get(res.user.id) || [];
                list.push(res);
                userReservations.set(res.user.id, list);
            }
            let sentCount = 0;
            for (const [userId, reservations] of userReservations) {
                if (notifiedUsers.has(userId)) continue;
                const user = reservations[0].user;
                if (!user?.deviceTokens?.length) continue;
                const rawLang = user.settings?.language || 'fr';
                const lang = rawLang.split('-')[0];
                const isToday = reservations[0].startDate === todayStr;
                const dayText = isToday ? this.t('common.today', lang) : this.t('common.tomorrow', lang);
                const count = reservations.length;
                const hotel = reservations[0].product?.company;
                const hotelName = hotel?.companyName || this.t('common.hotel', lang);
                let body = '';
                if (count === 1) {
                    body = this.t('cron.hotel_reminder.body_single', lang, { hotelName, day: dayText });
                } else {
                    body = this.t('cron.hotel_reminder.body_multiple', lang, { count, day: dayText });
                }
                const title = isToday ? this.t('cron.hotel_reminder.title_today', lang) : this.t('cron.hotel_reminder.title_upcoming', lang);
                await this.safeSendNotification(userId, title, body, undefined, {
                    entity: 'RESERVATION',
                    entityId: reservations[0].id,
                    action: 'REMINDER',
                    count: String(count),
                });
                notifiedUsers.add(userId);
                sentCount++;
            }
            this.logger.log(`Rappels hôtel envoyés à ${sentCount} utilisateurs`);
        } catch (error) {
            this.logger.error('Erreur rappel réservations hôtel:', error);
        } finally {
            this.isRunningHotelReminder = false;
        }
    }

    // ==================== RAPPEL CHECK-OUT HÔTEL ====================
    @Cron('0 12 * * *')
    async remindHotelCheckout() {
        if (this.isRunningHotelCheckout) {
            this.logger.warn('remindHotelCheckout already running, skipping');
            return;
        }
        this.isRunningHotelCheckout = true;
        const notifiedUsers = new Set<string>();
        try {
            this.logger.log('Vérification des check-out à venir');
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];
            const checkouts = await this.hotelReservationRepository.find({
                where: { endDate: tomorrowStr, status: HotelReservationStatus.CHECKED_IN },
                relations: ['user', 'user.deviceTokens', 'user.settings', 'product', 'product.company'],
            });
            let sentCount = 0;
            for (const res of checkouts) {
                const user = res.user;
                if (!user?.deviceTokens?.length || notifiedUsers.has(user.id)) continue;
                const rawLang = user.settings?.language || 'fr';
                const lang = rawLang.split('-')[0];
                const hotel = res.product?.company;
                const hotelName = hotel?.companyName || this.t('common.hotel', lang);
                const title = this.t('cron.hotel_checkout.title', lang);
                const body = this.t('cron.hotel_checkout.body', lang, { hotelName });
                await this.safeSendNotification(user.id, title, body, undefined, {
                    entity: 'RESERVATION',
                    entityId: res.id,
                    action: 'CHECKOUT_REMINDER',
                });
                notifiedUsers.add(user.id);
                sentCount++;
            }
            this.logger.log(`Rappels check-out envoyés à ${sentCount} utilisateurs`);
        } catch (error) {
            this.logger.error('Erreur rappel check-out:', error);
        } finally {
            this.isRunningHotelCheckout = false;
        }
    }

    // ==================== NOUVEAUX PRESTATAIRES ====================
    // ✅ Seulement les clients qui utilisent déjà des services
    @Cron('0 9 * * 1')
    async notifyNewPrestataires() {
        if (this.isRunningNewPrestataires) {
            this.logger.warn('notifyNewPrestataires already running, skipping');
            return;
        }
        this.isRunningNewPrestataires = true;
        try {
            this.logger.log('Vérification des nouveaux prestataires');
            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            const newPrestataires = await this.prestataireRepository.find({
                where: { createdAt: MoreThan(lastMonth), status: PrestataireStatus.ACTIVE },
                relations: ['services'],
            });
            if (newPrestataires.length === 0) return;
            const specialtyText = [...new Set(newPrestataires.map((p) => p.specialite || p.competence).filter(Boolean))].slice(0, 3).join(', ');
            const users = await this.marketingAudience(await this.usersWhoOrderedTypes([CompanyType.SERVICE]));
            let sentCount = 0;
            for (const user of users) {
                const lang = this.langOf(user);
                const ok = await this.sendMarketing(
                    user,
                    this.t('cron.new_prestataires.title', lang),
                    this.t('cron.new_prestataires.body', lang, { count: newPrestataires.length, specialties: specialtyText }),
                    undefined,
                    { entity: 'PRESTATAIRE', action: 'NEW', count: String(newPrestataires.length) },
                );
                if (ok) sentCount++;
            }
            this.logger.log(`Nouveaux prestataires : ${sentCount} client(s) concerné(s) notifié(s)`);
        } catch (error) {
            this.logger.error('Erreur notification nouveaux prestataires:', error);
        } finally {
            this.isRunningNewPrestataires = false;
        }
    }

    // ==================== PROMOTION VOITURES ====================
    // ✅ Seulement les clients intéressés par les voitures (commandes / favoris CAR), voitures de leur ville
    @Cron('0 9 * * *')
    async notifyCarPromotions() {
        if (this.isRunningCarPromotions) {
            this.logger.warn('notifyCarPromotions already running, skipping');
            return;
        }
        this.isRunningCarPromotions = true;
        try {
            this.logger.log('Début notification des voitures disponibles');
            const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const cars = await this.productRepository.find({
                where: { status: ProductStatus.PUBLISHED, type: CompanyType.CAR, createdAt: MoreThan(since) },
                relations: ['company', 'company.city', 'company.country', 'category', 'images'],
                order: { createdAt: 'DESC' },
            });
            const validCars = cars.filter((car) => {
                const price = car.salePrice ?? car.price ?? car.detail;
                return price && price > 0;
            });
            if (validCars.length === 0) {
                this.logger.log('Aucune nouvelle voiture cette semaine');
                return;
            }
            const users = await this.marketingAudience();
            const profiles = await this.interestProfiles(users.map((u) => u.id));
            let sentCount = 0;
            for (const user of users) {
                const profile = profiles.get(user.id);
                // Intérêt explicite pour les voitures obligatoire
                if (!profile?.types.has(CompanyType.CAR)) continue;
                const mine = validCars.filter((c) => this.sameArea(user, c.company?.city?.name, c.company?.country?.name) !== false);
                if (!mine.length) continue;
                const lang = this.langOf(user);
                const currency = mine[0]?.company?.localCurrency || 'USD';
                let body = '';
                if (mine.length === 1) {
                    const car = mine[0];
                    body = this.t('cron.car_promotion.body_single', lang, {
                        model: car.model || car.name,
                        year: car.year || '',
                        price: car.salePrice ?? car.price ?? car.detail,
                        currency,
                        company: car.company?.companyName || 'FavorHelp',
                    });
                } else {
                    const minPrice = Math.min(...mine.map((c) => c.salePrice ?? c.price ?? c.detail ?? 0));
                    body = this.t('cron.car_promotion.body_multiple', lang, { count: mine.length, minPrice, currency });
                }
                const ok = await this.sendMarketing(user, this.t('cron.car_promotion.title', lang), body, mine[0]?.images?.[0]?.url || undefined, {
                    entity: 'PRODUCT',
                    entityId: mine[0].id,
                    action: 'CAR_PROMOTION',
                    count: String(mine.length),
                });
                if (ok) sentCount++;
            }
            this.logger.log(`Voitures : ${sentCount} client(s) intéressé(s) notifié(s) (${validCars.length} nouvelles voitures)`);
        } catch (error) {
            this.logger.error('Erreur dans notifyCarPromotions:', error);
        } finally {
            this.isRunningCarPromotions = false;
        }
    }

    // ==================== RAPPEL PRODUITS LES PLUS COMMANDÉS (11h et 20h) ====================
    @Cron('0 11 * * *')
    @Cron('0 20 * * *')
    async remindMostOrderedProducts() {
        if (this.isRunningFrequentProducts) {
            this.logger.warn('remindMostOrderedProducts already running, skipping');
            return;
        }
        this.isRunningFrequentProducts = true;
        const notifiedUsers = new Set<string>();
        try {
            this.logger.log('Début du rappel des produits les plus commandés par utilisateur');
            const orders = await this.orderRepository.find({
                where: [
                    { status: OrderStatus.DELIVERED, createdAt: MoreThan(this.interestSince) },
                    { status: OrderStatus.COMPLETED, createdAt: MoreThan(this.interestSince) }
                ],
                relations: ['user', 'orderItems', 'orderItems.product', 'orderItems.product.images'],
                order: { createdAt: 'DESC' }
            });
            const userOrdersMap = new Map<string, OrderEntity[]>();
            for (const order of orders) {
                if (!order.user) continue;
                const list = userOrdersMap.get(order.userId) || [];
                list.push(order);
                userOrdersMap.set(order.userId, list);
            }
            // ✅ Clients qui acceptent les promotions, sans promotion reçue récemment
            const eligibleFrequent = new Map((await this.marketingAudience([...userOrdersMap.keys()])).map((u) => [u.id, u]));
            let sentCount = 0;
            for (const [userId, userOrders] of userOrdersMap) {
                if (notifiedUsers.has(userId) || !eligibleFrequent.has(userId)) continue;
                const productCount = new Map<string, { product: Product; count: number; imageUrl?: string }>();
                for (const order of userOrders) {
                    for (const item of order.orderItems) {
                        const product = item.product;
                        // ✅ Seulement les produits encore en vente
                        if (!product || product.status !== ProductStatus.PUBLISHED) continue;
                        const existing = productCount.get(product.id);
                        if (existing) {
                            existing.count++;
                        } else {
                            productCount.set(product.id, {
                                product,
                                count: 1,
                                imageUrl: product.images?.[0]?.url
                            });
                        }
                    }
                }
                const sortedProducts = Array.from(productCount.values())
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 3);
                if (sortedProducts.length === 0) continue;
                const user = eligibleFrequent.get(userId);
                if (!user?.deviceTokens?.length) continue;
                const rawLang = user.settings?.language || 'fr';
                const lang = rawLang.split('-')[0];
                let title = '', body = '', imageUrl = '';
                if (sortedProducts.length === 1) {
                    const p = sortedProducts[0];
                    title = this.t('cron.frequent_products.title', lang);
                    body = this.t('cron.frequent_products.body_single', lang, {
                        productName: p.product.name,
                        count: p.count
                    });
                    imageUrl = p.imageUrl || '';
                } else {
                    const names = sortedProducts.map(p => p.product.name).join(', ');
                    title = this.t('cron.frequent_products.title', lang);
                    body = this.t('cron.frequent_products.body_multiple', lang, { names });
                    imageUrl = sortedProducts[0].imageUrl || '';
                }
                await this.sendMarketing(user, title, body, imageUrl, {
                    entity: 'ORDER',
                    entityId: sortedProducts[0].product.id,
                    action: 'ORDER',
                    count: String(sortedProducts.length)
                });
                notifiedUsers.add(userId);
                sentCount++;
            }
            this.logger.log(`Rappel produits fréquents envoyé à ${sentCount} utilisateurs`);
        } catch (error) {
            this.logger.error('Erreur dans remindMostOrderedProducts:', error);
        } finally {
            this.isRunningFrequentProducts = false;
        }
    }


}