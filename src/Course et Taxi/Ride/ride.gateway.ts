import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { forwardRef, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Socket } from 'socket.io';
import { NotificationsGateway } from 'src/notification/notifications.gateway';
import { WsAuthHelper } from 'src/notification/utils/ws-auth.helper';
import { UserEntity } from 'src/users/entities/user.entity';
import { RideService } from './ride.service';
import { RideRealtimeService } from './ride-realtime.service';
import { DriverLocationService } from '../DriverLocation/driver-location.service';
import { rideRoom, RideSocketEvents } from './enum/ride-event.enum';

type Ack<T = any> = { success: true; data: T } | { success: false; error: string; status?: number };

/**
 * Événements Socket.IO des courses, sur le WebSocket PRINCIPAL ('/')
 * déjà utilisé par NotificationsGateway (même connexion, même token JWT).
 * L'identité vient de socket.data.userId posé par NotificationsGateway.
 *
 * À la (re)connexion d'un utilisateur :
 *  - course en cours → il rejoint ride-<id> et reçoit 'ride:state' ;
 *  - chauffeur en ligne → rooms 'drivers' + 'drivers-category-<id>' et ses offres encore ouvertes.
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/',
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
  connectTimeout: 45000,
  allowEIO3: true,
})
export class RideGateway implements OnModuleInit {
  private readonly logger = new Logger(RideGateway.name);

  constructor(
    @Inject(forwardRef(() => NotificationsGateway))
    private readonly notificationsGateway: NotificationsGateway,
    private readonly wsAuthHelper: WsAuthHelper,
    private readonly rideService: RideService,
    private readonly realtime: RideRealtimeService,
    private readonly driverLocation: DriverLocationService,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
  ) { }

  onModuleInit() {
    this.notificationsGateway.onUserIdentified(async (socket, user) => {
      await this.prepareSocket(socket, user.userId);
    });
    this.logger.log('✅ Courses (taxi) branchées sur NotificationsGateway');
  }

  private lang(socket: Socket): string {
    const raw = String(socket.handshake?.headers?.['accept-language'] || socket.handshake?.auth?.lang || 'fr');
    const l = raw.split(',')[0].split(';')[0].trim().slice(0, 2).toLowerCase();
    return ['fr', 'en', 'es', 'sw', 'ar'].includes(l) ? l : 'fr';
  }

  private parse<T = any>(data: any): T {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return { rideId: data } as any;
      }
    }
    return (data ?? {}) as T;
  }

  private async user(socket: Socket): Promise<UserEntity | null> {
    const id = this.wsAuthHelper.extractUserId(socket);
    if (!id) return null;
    return this.userRepo.findOne({ where: { id } });
  }

  private fail(socket: Socket, e: any): Ack {
    const error = e?.response?.message ?? e?.message ?? 'Erreur';
    const status = e?.status ?? e?.response?.statusCode;
    socket.emit(RideSocketEvents.ERROR, { error, status });
    return { success: false, error: Array.isArray(error) ? error.join(', ') : String(error), status };
  }

  /** État initial à la connexion (reprise après coupure réseau / app relancée) */
  private async prepareSocket(socket: Socket, userId: string) {
    try {
      const state = await this.rideService.getStateForUser(userId);
      if (state) {
        socket.join(rideRoom(state.ride.rideId));
        socket.emit(RideSocketEvents.STATE, state);
      }
      const location = await this.driverLocation.findLocation(userId);
      if (location?.isOnline) {
        const vehicle = await this.driverLocation.getActiveVehicle(userId);
        if (vehicle) {
          this.realtime.joinDriverRooms(userId, vehicle.categoryId);
          if (!location.isBusy) {
            const offers = await this.rideService.openOffersFor(userId);
            for (const ride of offers) {
              socket.emit(RideSocketEvents.OFFER, {
                rideId: ride.id,
                pickupLocation: ride.pickupLocation,
                dropoffLocation: ride.dropoffLocation,
                riderName: ride.rider?.fullName ?? null,
                price: ride.price != null ? Number(ride.price) : null,
                currency: ride.currency ?? null,
                paymentMethod: ride.paymentMethod ?? 'CASH',
                categoryId: ride.categoryId,
                resumed: true,
              });
            }
          }
        }
      }
    } catch (e: any) {
      this.logger.warn(`Préparation socket course (${userId}): ${e?.message}`);
    }
  }

  // ============================================================
  // CHAUFFEUR : DISPONIBILITÉ + POSITION
  // ============================================================

  @SubscribeMessage(RideSocketEvents.DRIVER_ONLINE)
  async driverOnline(@MessageBody() data: any, @ConnectedSocket() socket: Socket): Promise<Ack> {
    const userId = this.wsAuthHelper.extractUserId(socket);
    if (!userId) return { success: false, error: 'Socket non identifié' };
    const vehicle = await this.driverLocation.getActiveVehicle(userId);
    if (!vehicle) return this.fail(socket, { message: 'Veuillez ajouter un véhicule actif', status: 400 });
    const p = this.parse<{ lat?: number; lng?: number }>(data);
    if (p.lat != null && p.lng != null) {
      await this.driverLocation.updatePositionLive(userId, { lat: Number(p.lat), lng: Number(p.lng) }, true);
    } else {
      await this.driverLocation.setOnlineSafe(userId, true);
    }
    this.realtime.joinDriverRooms(userId, vehicle.categoryId);
    await this.prepareSocket(socket, userId);
    return { success: true, data: { online: true, categoryId: vehicle.categoryId } };
  }

  @SubscribeMessage(RideSocketEvents.DRIVER_OFFLINE)
  async driverOffline(@ConnectedSocket() socket: Socket): Promise<Ack> {
    const userId = this.wsAuthHelper.extractUserId(socket);
    if (!userId) return { success: false, error: 'Socket non identifié' };
    const active = await this.rideService.getActiveRide(userId);
    if (active && active.driverId === userId) {
      return { success: false, error: 'Course en cours : impossible de passer hors ligne' };
    }
    await this.driverLocation.setOnlineSafe(userId, false);
    this.realtime.leaveDriverRooms(userId);
    return { success: true, data: { online: false } };
  }

  /** Position du chauffeur toutes les 3 à 5 s (remplace l'appel REST pendant une course) */
  @SubscribeMessage(RideSocketEvents.DRIVER_LOCATION)
  async driverLocationUpdate(@MessageBody() data: any, @ConnectedSocket() socket: Socket): Promise<Ack> {
    const userId = this.wsAuthHelper.extractUserId(socket);
    if (!userId) return { success: false, error: 'Socket non identifié' };
    const p = this.parse<{ lat: number; lng: number; heading?: number; speed?: number }>(data);
    if (p.lat == null || p.lng == null) return { success: false, error: 'lat et lng requis' };
    await this.driverLocation.updatePositionLive(userId, {
      lat: Number(p.lat),
      lng: Number(p.lng),
      heading: p.heading ?? null,
      speed: p.speed ?? null,
    });
    return { success: true, data: { received: true } };
  }

  // ============================================================
  // CYCLE DE LA COURSE
  // ============================================================

  @SubscribeMessage(RideSocketEvents.OFFER_ACCEPT)
  async accept(@MessageBody() data: any, @ConnectedSocket() socket: Socket): Promise<Ack> {
    const userId = this.wsAuthHelper.extractUserId(socket);
    if (!userId) return { success: false, error: 'Socket non identifié' };
    try {
      const { rideId } = this.parse<{ rideId: string }>(data);
      const ride = await this.rideService.acceptRide(rideId, userId, this.lang(socket));
      socket.join(rideRoom(ride.id));
      return { success: true, data: ride };
    } catch (e) {
      return this.fail(socket, e);
    }
  }

  @SubscribeMessage(RideSocketEvents.OFFER_REJECT)
  async reject(@MessageBody() data: any, @ConnectedSocket() socket: Socket): Promise<Ack> {
    const userId = this.wsAuthHelper.extractUserId(socket);
    if (!userId) return { success: false, error: 'Socket non identifié' };
    try {
      const { rideId, reason } = this.parse<{ rideId: string; reason?: string }>(data);
      return { success: true, data: (await this.rideService.rejectOffer(rideId, userId, reason, this.lang(socket))).data };
    } catch (e) {
      return this.fail(socket, e);
    }
  }

  @SubscribeMessage(RideSocketEvents.ARRIVED)
  async arrived(@MessageBody() data: any, @ConnectedSocket() socket: Socket): Promise<Ack> {
    try {
      const user = await this.user(socket);
      if (!user) return { success: false, error: 'Socket non identifié' };
      const { rideId } = this.parse<{ rideId: string }>(data);
      return { success: true, data: (await this.rideService.markArrived(rideId, user, this.lang(socket))).data };
    } catch (e) {
      return this.fail(socket, e);
    }
  }

  @SubscribeMessage(RideSocketEvents.START)
  async start(@MessageBody() data: any, @ConnectedSocket() socket: Socket): Promise<Ack> {
    try {
      const user = await this.user(socket);
      if (!user) return { success: false, error: 'Socket non identifié' };
      const { rideId } = this.parse<{ rideId: string }>(data);
      return { success: true, data: (await this.rideService.startRide(rideId, user, this.lang(socket))).data };
    } catch (e) {
      return this.fail(socket, e);
    }
  }

  @SubscribeMessage(RideSocketEvents.COMPLETE)
  async complete(@MessageBody() data: any, @ConnectedSocket() socket: Socket): Promise<Ack> {
    try {
      const user = await this.user(socket);
      if (!user) return { success: false, error: 'Socket non identifié' };
      const p = this.parse<{ rideId: string; distance?: number; duration?: number; paymentMethod?: any }>(data);
      return {
        success: true,
        data: (await this.rideService.completeRide(p.rideId, user, p, this.lang(socket))).data,
      };
    } catch (e) {
      return this.fail(socket, e);
    }
  }

  @SubscribeMessage(RideSocketEvents.CANCEL)
  async cancel(@MessageBody() data: any, @ConnectedSocket() socket: Socket): Promise<Ack> {
    try {
      const user = await this.user(socket);
      if (!user) return { success: false, error: 'Socket non identifié' };
      const { rideId, reason } = this.parse<{ rideId: string; reason?: string }>(data);
      const current = await this.rideService.findOne(rideId, this.lang(socket), user);
      const by = current.data.driverId === user.id ? 'DRIVER' : current.data.riderId === user.id ? 'RIDER' : 'SYSTEM';
      return { success: true, data: await this.rideService.cancelRide(rideId, by, reason, this.lang(socket), user) };
    } catch (e) {
      return this.fail(socket, e);
    }
  }

  /** Suivre une course (écran de suivi ouvert) */
  @SubscribeMessage(RideSocketEvents.JOIN)
  async join(@MessageBody() data: any, @ConnectedSocket() socket: Socket): Promise<Ack> {
    try {
      const user = await this.user(socket);
      if (!user) return { success: false, error: 'Socket non identifié' };
      const { rideId } = this.parse<{ rideId: string }>(data);
      const ride = await this.rideService.findOne(rideId, this.lang(socket), user);
      socket.join(rideRoom(rideId));
      return { success: true, data: ride.data };
    } catch (e) {
      return this.fail(socket, e);
    }
  }

  @SubscribeMessage(RideSocketEvents.LEAVE)
  leave(@MessageBody() data: any, @ConnectedSocket() socket: Socket): Ack {
    const { rideId } = this.parse<{ rideId: string }>(data);
    if (rideId) socket.leave(rideRoom(rideId));
    return { success: true, data: { rideId } };
  }

  @SubscribeMessage(RideSocketEvents.GET_STATE)
  async getState(@ConnectedSocket() socket: Socket): Promise<Ack> {
    const userId = this.wsAuthHelper.extractUserId(socket);
    if (!userId) return { success: false, error: 'Socket non identifié' };
    const state = await this.rideService.getStateForUser(userId);
    if (state) socket.join(rideRoom(state.ride.rideId));
    return { success: true, data: state };
  }
}
