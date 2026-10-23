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
  /** Enregistrer dans user_notifications (liste des notifications de l'app) */
  save?: boolean;
  lang?: string;
}

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

    if (input.event) this.emitToUsers(ids, input.event, { ...data, title, body, timestamp: new Date().toISOString() });

    if (input.save !== false) {
      try {
        await this.notificationsService.sendAndSaveNotificationToUsers(ids, title, body, input.type, data);
      } catch (e: any) {
        this.logger.warn(`Notification course non enregistrée: ${e?.message}`);
      }
    }

    const mode = input.push ?? 'always';
    if (mode === 'never') return;
    const targets = mode === 'offline' ? ids.filter((id) => !this.isOnline(id)) : ids;
    if (!targets.length) return;

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
        },
      )
      .catch((e) => this.logger.warn(`Push course: ${e?.message}`));
  }
}
