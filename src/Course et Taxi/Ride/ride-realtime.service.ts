import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server } from 'socket.io';
import { NotificationsGateway } from 'src/notification/notifications.gateway';
import { NotificationsService } from 'src/notification/notifications.service';
import { FcmService } from 'src/notification/fcm.service';
import { PresenceService } from 'src/notification/presence.service';
import { NotificationType } from 'src/notification/type/notification.type';
import { I18nService } from 'src/libs/common/src';
import { DRIVERS_ROOM, driversCategoryRoom, rideRoom } from './enum/ride-event.enum';
import { NotificationChannel, resolveChannels } from 'src/notification/utils/platform-channel';

export interface RideNotifyInput {
  userIds: string[];
  /** Clé i18n (ride.json) du titre et du texte : ride.notif.<key>.title / .body */
  key: string;
  params?: Record<string, any>;
  type: NotificationType;
  rideId: string;
  /** Événement WebSocket dédié (en plus de 'notification') */
  event?: string;
  payload?: Record<string, any>;
  /** Push Firebase : 'always' (défaut) | 'offline' (seulement si hors ligne) | 'never' */
  push?: 'always' | 'offline' | 'never';
  /**
   * ✅ Style du push : 'notification' (défaut) ou 'call' = appel entrant plein écran qui sonne
   * (nouvelle course pour le chauffeur). Durée de la sonnerie : ringSeconds.
   */
  pushStyle?: 'notification' | 'call';
  ringSeconds?: number;
  /** Enregistrer dans user_notifications (liste des notifications de l'app) */
  save?: boolean;
  lang?: string;
  /**
   * ✅ Applications ciblées (x-platform) : 'mobile' | 'web' | 'admin' | 'group' | 'driver'.
   * Défaut selon le type : NEW_RIDE (offre au chauffeur) → mobile ; suivi du client → mobile + web.
   * Réglable par variables d'environnement : NOTIFICATION_CHANNELS_NEW_RIDE=mobile …
   */
  channels?: NotificationChannel[];
  /**
   * ✅ Rôle du destinataire DANS LA COURSE (le même compte peut être passager ET chauffeur) :
   *   'rider'  → applications passager (RIDE_RIDER_CHANNELS, défaut mobile,web) ;
   *   'driver' → application Favor Driver (RIDE_DRIVER_CHANNELS, défaut driver).
   * Le chauffeur ne reçoit donc pas ses offres dans l'application client, ni le passager dans Favor Driver.
   */
  audience?: 'rider' | 'driver';
}

/** Applications d'un rôle de course (.env) */
const channelList = (raw: string | undefined, fallback: string): NotificationChannel[] =>
  (raw || fallback)
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean) as NotificationChannel[];

/**
 * Pont entre les courses et l'existant :
 *  - WebSocket principal (NotificationsGateway.server) : room personnelle <userId>,
 *    room de course ride-<rideId>, room 'drivers' et drivers-category-<categoryId> ;
 *  - notifications enregistrées (NotificationsService → user_notifications + événement 'notification') ;
 *  - push Firebase (FcmService : tous les appareils, nettoyage des tokens invalides).
 */
@Injectable()
export class RideRealtimeService {
  private readonly logger = new Logger(RideRealtimeService.name);

  constructor(
    @Inject(forwardRef(() => NotificationsGateway))
    private readonly gateway: NotificationsGateway,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly fcmService: FcmService,
    private readonly presence: PresenceService,
    private readonly i18n: I18nService,
    private readonly config: ConfigService,
  ) { }

  private get server(): Server | null {
    return this.gateway?.server ?? null;
  }

  private get androidChannelId(): string | undefined {
    return this.config.get<string>('RIDE_ANDROID_CHANNEL_ID') || undefined;
  }

  /**
   * ✅ Canal Android des appels de course — défaut : incoming_calls
   * (créé par l'app Favor Driver avec la sonnerie du téléphone, usage « sonnerie »)
   */
  private get callChannelId(): string {
    return this.config.get<string>('RIDE_CALL_ANDROID_CHANNEL_ID') || 'incoming_calls';
  }

  /** ✅ Sonnerie iOS (fichier dans l'app) — défaut : ride_ringtone.caf */
  private get callIosSound(): string {
    return this.config.get<string>('RIDE_CALL_IOS_SOUND') || 'ride_ringtone.caf';
  }

  /** ✅ Désactiver l'appel (retour aux notifications classiques) : RIDE_CALL_PUSH=false */
  private get callEnabled(): boolean {
    return String(this.config.get('RIDE_CALL_PUSH') ?? 'true').toLowerCase() !== 'false';
  }

  /** ✅ Applications du passager (défaut : application Favor Help mobile + site web) */
  get riderChannels(): NotificationChannel[] {
    return channelList(this.config.get<string>('RIDE_RIDER_CHANNELS'), 'mobile,web');
  }

  /** ✅ Applications du chauffeur (défaut : Favor Driver uniquement) */
  get driverChannels(): NotificationChannel[] {
    return channelList(this.config.get<string>('RIDE_DRIVER_CHANNELS'), 'driver');
  }

  /** Canaux d'une notification de course : explicites > rôle du destinataire > type */
  private channelsFor(input: Pick<RideNotifyInput, 'channels' | 'audience' | 'type'>): NotificationChannel[] | undefined {
    if (input.channels?.length) return resolveChannels(input.type, input.channels);
    if (input.audience === 'rider') return resolveChannels(input.type, this.riderChannels);
    if (input.audience === 'driver') return resolveChannels(input.type, this.driverChannels);
    return resolveChannels(input.type);
  }

  /**
   * ✅ L'utilisateur a-t-il l'application CIBLÉE ouverte ? (mode push 'offline')
   * Avant : « en ligne » sur n'importe quelle application — un chauffeur avec Favor Driver ouvert
   * ne recevait pas le push de sa course de passager.
   */
  private async isOnlineOn(userId: string, channels?: NotificationChannel[]): Promise<boolean> {
    if (!this.isOnline(userId)) return false;
    if (!channels?.length) return true;
    try {
      const connected = await this.gateway.connectedChannels(userId);
      return connected.some((ch) => ch === null || channels.includes(ch));
    } catch {
      return this.isOnline(userId);
    }
  }

  t(key: string, lang = 'fr', params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params);
  }

  // ---------------- WebSocket ----------------
  emitToUser(userId: string, event: string, payload: any) {
    if (userId) this.server?.to(userId).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: any) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (ids.length) this.server?.to(ids).emit(event, payload);
  }

  emitToRide(rideId: string, event: string, payload: any) {
    this.server?.to(rideRoom(rideId)).emit(event, payload);
  }

  /** ✅ Room de la course + utilisateurs, en UN envoi (Socket.IO ne double pas un socket présent dans plusieurs rooms) */
  emitToRideAndUsers(rideId: string, userIds: string[], event: string, payload: any) {
    const rooms = [rideRoom(rideId), ...new Set(userIds.filter(Boolean))];
    this.server?.to(rooms).emit(event, payload);
  }

  /** Fait rejoindre la room de la course à tous les sockets de ces utilisateurs */
  joinRide(userIds: string[], rideId: string) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (ids.length) this.server?.in(ids).socketsJoin(rideRoom(rideId));
  }

  leaveRide(userIds: string[], rideId: string) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (ids.length) this.server?.in(ids).socketsLeave(rideRoom(rideId));
  }

  /** Chauffeur disponible : rooms 'drivers' + catégorie de son véhicule */
  joinDriverRooms(driverId: string, categoryId?: string | null) {
    if (!this.server || !driverId) return;
    this.server.in(driverId).socketsJoin(DRIVERS_ROOM);
    if (categoryId) this.server.in(driverId).socketsJoin(driversCategoryRoom(categoryId));
  }

  leaveDriverRooms(driverId: string) {
    if (!this.server || !driverId) return;
    this.server.in(driverId).socketsLeave(DRIVERS_ROOM);
  }

  isOnline(userId: string): boolean {
    try {
      return this.presence.isOnline(userId);
    } catch {
      return false;
    }
  }

  // ---------------- Notification complète ----------------
  /**
   * Notifie des utilisateurs sur tous les canaux existants, sans jamais lever d'erreur :
   *  1. événement WebSocket dédié (ex. 'ride:accepted') ;
   *  2. notification enregistrée + événement 'notification' (comportement historique) ;
   *  3. push Firebase (data.category = 'ride', data.rideId, data.event).
   */
  async notify(input: RideNotifyInput): Promise<void> {
    const ids = [...new Set((input.userIds || []).filter(Boolean))];
    if (!ids.length) return;
    const lang = input.lang || 'fr';
    const title = this.t(`ride.notif.${input.key}.title`, lang, input.params);
    const body = this.t(`ride.notif.${input.key}.body`, lang, input.params);
    const data = {
      category: 'ride',
      rideId: input.rideId,
      event: input.event ?? input.type,
      ...(input.payload ?? {}),
    };

    // ✅ Canaux : applications qui reçoivent cette notification (WebSocket, liste, push, appel),
    //    selon le rôle du destinataire dans la course (passager / chauffeur)
    const channels = this.channelsFor(input);

    if (input.event) {
      const payload = { ...data, title, body, timestamp: new Date().toISOString() };
      if (channels?.length) for (const id of ids) void this.gateway.emitToUserChannels(id, input.event, payload, channels);
      else this.emitToUsers(ids, input.event, payload);
    }

    if (input.save !== false) {
      try {
        await this.notificationsService.sendAndSaveNotificationToUsers(ids, title, body, input.type, data, { channels });
      } catch (e: any) {
        this.logger.warn(`Notification course non enregistrée: ${e?.message}`);
      }
    }

    const mode = input.push ?? 'always';
    if (mode === 'never') return;
    let targets = ids;
    if (mode === 'offline') {
      const online = await Promise.all(ids.map((id) => this.isOnlineOn(id, channels)));
      targets = ids.filter((_, i) => !online[i]);
    }
    if (!targets.length) return;

    // ✅ Appel entrant (nouvelle course) : écran d'appel qui sonne sur le téléphone du chauffeur
    if (input.pushStyle === 'call' && this.callEnabled) {
      void this.fcmService
        .sendCallToUsers(
          targets,
          title,
          body,
          {
            type: input.type,
            category: 'ride',
            rideId: input.rideId,
            event: input.event ?? input.type,
            screen: 'ride_incoming',
            ...(input.payload ?? {}),
          },
          {
            callId: input.rideId,
            ttlSeconds: Math.max(5, input.ringSeconds ?? 30),
            androidChannelId: this.callChannelId,
            iosSound: this.callIosSound,
            // ✅ Android : notification système de secours → 'default' = son du canal (sonnerie du téléphone)
            androidSound: this.config.get<string>('RIDE_CALL_ANDROID_SOUND') || 'default',
            iosCategory: 'RIDE_CALL',
            channels,
          },
        )
        .catch((e) => this.logger.warn(`Appel course: ${e?.message}`));
      return;
    }

    void this.fcmService
      .sendPushToUsers(
        targets,
        title,
        body,
        {
          type: input.type,
          category: 'ride',
          rideId: input.rideId,
          event: input.event ?? input.type,
          screen: 'ride',
        },
        {
          tag: `ride-${input.rideId}`,
          androidChannelId: this.androidChannelId,
          channels,
        },
      )
      .catch((e) => this.logger.warn(`Push course: ${e?.message}`));
  }

  /**
   * ✅ Offre terminée pour ces chauffeurs (prise par un autre, annulée, expirée) :
   * l'offre disparaît de leur liste de notifications — seul le chauffeur de la course garde ses notifications.
   */
  async clearOfferNotifications(userIds: string[], rideId: string) {
    try {
      await this.notificationsService.deleteByData(userIds, 'rideId', rideId, [NotificationType.NEW_RIDE]);
    } catch (e: any) {
      this.logger.warn(`Offres non retirées (${rideId}) : ${e?.message}`);
    }
  }

  /** ✅ Arrête la sonnerie de l'appel « nouvelle course » chez ces chauffeurs (offre prise, annulée, expirée) */
  cancelCall(userIds: string[], rideId: string, reason: string) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length || !this.callEnabled) return;
    void this.fcmService
      .cancelCallForUsers(ids, rideId, reason, { category: 'ride', rideId, type: 'ride_call_cancel' }, resolveChannels(NotificationType.NEW_RIDE, this.driverChannels))
      .catch((e) => this.logger.warn(`Fin d'appel course: ${e?.message}`));
  }
}
