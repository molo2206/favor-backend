// notifications.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { RideService } from 'src/Course et Taxi/Ride/ride.service';
import { NotificationsService } from './notifications.service';
import { NotificationType } from './type/notification.type';
import { DriverLocationService } from 'src/Course et Taxi/DriverLocation/driver-location.service';
import { OrderDeliveryService } from 'src/order/order-delivery.service';

interface ActiveUser {
  id: string;
  socketId: string;
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/',
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
  connectTimeout: 45000,
  allowEIO3: true,
})
@Injectable()
export class NotificationsGateway implements OnModuleInit, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private activeUsers: ActiveUser[] = [];

  private activeTrackings: Map<string, Set<string>> = new Map();

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @Inject(forwardRef(() => RideService))
    private readonly rideService: RideService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly driverLocationService: DriverLocationService,

    @Inject(forwardRef(() => OrderDeliveryService))
    private readonly deliveryService: OrderDeliveryService,
  ) { }

  onModuleInit() {
    console.log('✅ WebSocket Gateway initialized');
    this.server.emit('confirmation');
  }

  @SubscribeMessage('connection')
  async sendConfirm(
    @MessageBody() userId: string,
    @ConnectedSocket() socket: Socket,
  ) {
    console.log(`📡 Connection event received for user: ${userId}`);
    console.log(`   Socket ID: ${socket.id}`);

    if (!userId || typeof userId !== 'string') {
      console.warn(`⚠️ Connection sans userId valide - Socket ${socket.id}`);
      socket.emit('connection-error', { message: 'userId requis' });
      return;
    }

    const existingDriverIndex = this.activeUsers.findIndex(
      (user) => user.id === userId,
    );

    socket.join(userId);

    if (existingDriverIndex !== -1) {
      const oldSocketId = this.activeUsers[existingDriverIndex].socketId;
      if (oldSocketId === socket.id) {
        console.log(`ℹ️ User ${userId} already connected with same socket`);
      } else {
        this.activeUsers[existingDriverIndex].socketId = socket.id;
        console.log(`🔄 User ${userId} reconnected (old: ${oldSocketId}, new: ${socket.id})`);
      }
    } else if (userId) {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });
      if (user) {
        this.activeUsers.push({
          id: userId,
          socketId: socket.id,
        });
        console.log(`🔌 User ${userId} connected (${user.fullName}, role: ${user.role})`);
      } else {
        console.warn(`⚠️ User ${userId} introuvable en base`);
        socket.emit('connection-error', { message: 'Utilisateur introuvable' });
        return;
      }
    }

    this.broadcastUsers();
    socket.emit('confirmation');
    console.log(`✅ Confirmation sent to ${userId}`);
  }

  handleDisconnect(client: Socket) {
    const userIndex = this.activeUsers.findIndex(
      (user) => user.socketId === client.id,
    );

    if (userIndex !== -1) {
      const userId = this.activeUsers[userIndex].id;
      this.activeUsers.splice(userIndex, 1);
      console.log(`❌ User ${userId} disconnected (socket: ${client.id})`);
      console.log(`   Reason: ${(client as any).disconnected ? 'unknown' : 'transport close'}`);

      if (this.activeTrackings.has(userId)) {
        const orders = Array.from(this.activeTrackings.get(userId)!);
        for (const orderId of orders) {
          const roomName = `order-${orderId}`;
          this.server.to(roomName).emit('trackingStopped', {
            orderId,
            deliverId: userId,
            reason: 'livreur_disconnected',
            timestamp: new Date().toISOString(),
          });
        }
        this.activeTrackings.delete(userId);
        console.log(`🧹 Trackings nettoyés pour ${userId}`);
      }
    }
    this.broadcastUsers();
  }

  @SubscribeMessage('disconnect-user')
  handleUserDisconnect(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const userIndex = this.activeUsers.findIndex((user) => user.id === userId);
    if (userIndex !== -1) {
      this.activeUsers.splice(userIndex, 1);
    }
    client.leave(userId);
    client.disconnect();
    console.log(`Utilisateur ${userId} déconnecté manuellement`);
    this.broadcastUsers();
  }

  sendNotificationToUser(userId: string, notification: any) {
    console.log(`📨 [Gateway] sendNotificationToUser called for ${userId}`);
    const userExists = this.activeUsers.some((user) => user.id === userId);
    console.log(
      `   User exists: ${userExists}, activeUsers:`,
      this.activeUsers.map((u) => u.id),
    );
    if (userExists) {
      this.server.to(userId).emit('notification', notification);
      console.log(`✅ Notification emitted to room ${userId}`);
    } else {
      console.log(`⚠️ User ${userId} is not connected`);
    }
  }

  sendNotificationToRoom(roomId: string, event: string, payload: any) {
    this.server.to(roomId).emit(event, payload);
    console.log(`📢 Notification "${event}" to room ${roomId}`);
  }

  @SubscribeMessage('join-company-room')
  handleJoinCompanyRoom(
    @MessageBody() data: { companyId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomName = `company-${data.companyId}`;
    client.join(roomName);
    console.log(`🔌 Client joined company room: ${roomName}`);
    return { success: true, room: roomName };
  }

  @SubscribeMessage('leave-company-room')
  handleLeaveCompanyRoom(
    @MessageBody() data: { companyId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomName = `company-${data.companyId}`;
    client.leave(roomName);
    console.log(`🔌 Client left company room: ${roomName}`);
    return { success: true, room: roomName };
  }

  broadcastNotification(notification: any) {
    this.server.emit('notification', notification);
    console.log('📢 Broadcast notification to all');
  }

  private broadcastUsers() {
    const users = this.activeUsers.map((user) => user.id);
    this.server.emit('active-users', users);
  }

  getActiveUsers(): string[] {
    return this.activeUsers.map((user) => user.id);
  }

  sendShipmentCreatedToCompany(
    companyId: string,
    shipmentData: {
      shipmentId: string;
      trackingNumber: string;
      status: string;
      companyType: string;
      companyName?: string;
    },
  ) {
    console.log(
      ` [Gateway] sendShipmentCreatedToCompany called for company ${companyId}`,
    );

    this.server
      .to(`company-${companyId}`)
      .emit('shipment-created-for-company', {
        ...shipmentData,
        timestamp: new Date().toISOString(),
        message: `Un nouveau colis ${shipmentData.trackingNumber} a été créé pour votre société`,
      });

    console.log(
      ` Shipment created event emitted to company room company-${companyId}`,
    );
  }

  sendShipmentCreatedEvent(
    userId: string,
    shipmentData: {
      shipmentId: string;
      trackingNumber: string;
      status: string;
    },
  ) {
    console.log(`📨 [Gateway] sendShipmentCreatedEvent called for ${userId}`);
    const userExists = this.activeUsers.some((user) => user.id === userId);

    if (userExists) {
      this.server.to(userId).emit('shipment-created', {
        ...shipmentData,
        timestamp: new Date().toISOString(),
        message: `Votre colis ${shipmentData.trackingNumber} a été créé avec succès`,
      });
      console.log(`✅ Shipment created event emitted to room ${userId}`);
    } else {
      console.log(`⚠️ User ${userId} is not connected`);
    }
  }

  sendNewDeliveryAssignment(deliverId: string, payload: any) {
    console.log(
      `📦 [Gateway] sendNewDeliveryAssignment called for deliver ${deliverId}`,
    );

    const userExists = this.activeUsers.some((user) => user.id === deliverId);

    if (userExists) {
      this.server.to(deliverId).emit('newDeliveryAssignment', {
        ...payload,
        timestamp: new Date().toISOString(),
      });
      console.log(`✅ newDeliveryAssignment emitted to deliver ${deliverId}`);
    } else {
      console.log(`⚠️ Deliver ${deliverId} is not connected`);
    }
  }

  sendDeliveryLocation(
    orderId: string,
    payload: {
      orderId: string;
      deliverId: string;
      latitude: number;
      longitude: number;
      speed?: number;
      heading?: number;
      distanceRemainingKm?: number;
      estimatedArrivalMinutes?: number;
      status: string;
    },
  ) {
    const roomName = `order-${orderId}`;

    this.server.to(roomName).emit('deliveryLocation', {
      ...payload,
      timestamp: new Date().toISOString(),
    });

    console.log(`📍 deliveryLocation emitted to room ${roomName}`);
  }

  sendDeliveryStatusUpdate(
    orderId: string,
    payload: {
      orderId: string;
      status: string;
      note?: string;
    },
  ) {
    const roomName = `order-${orderId}`;

    this.server.to(roomName).emit('deliveryStatusUpdate', {
      ...payload,
      timestamp: new Date().toISOString(),
    });

    console.log(`✅ deliveryStatusUpdate emitted to room ${roomName}`);
  }

  @SubscribeMessage('join-order-tracking')
  handleJoinOrderTracking(
    @MessageBody() data: { orderId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomName = `order-${data.orderId}`;
    client.join(roomName);
    console.log(`🔌 Client ${client.id} joined order room: ${roomName}`);
    return { success: true, room: roomName };
  }

  @SubscribeMessage('leave-order-tracking')
  handleLeaveOrderTracking(
    @MessageBody() data: { orderId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomName = `order-${data.orderId}`;
    client.leave(roomName);
    console.log(`🔌 Client ${client.id} left order room: ${roomName}`);
    return { success: true, room: roomName };
  }

  // ============================================================
  // 🔌 CONNECTER UN LIVREUR À UNE ROOM ORDER (par userId)
  // ============================================================
  joinOrderRoom(userId: string, orderId: string): void {
    const roomName = `order-${orderId}`;
    const activeUser = this.activeUsers.find((u) => u.id === userId);

    if (!activeUser) {
      console.warn(`⚠️ [joinOrderRoom] User ${userId} non connecté`);
      return;
    }

    const socket = this.server.sockets.sockets.get(activeUser.socketId);
    if (socket) {
      socket.join(roomName);
      console.log(`🔌 User ${userId} joined room ${roomName}`);
    } else {
      console.warn(`⚠️ [joinOrderRoom] Socket introuvable pour ${userId}`);
    }
  }

  // ============================================================
  // 🚪 DÉCONNECTER UN LIVREUR D'UNE ROOM ORDER (par userId)
  // ============================================================
  leaveOrderRoom(userId: string, orderId: string): void {
    const roomName = `order-${orderId}`;
    const activeUser = this.activeUsers.find((u) => u.id === userId);

    if (!activeUser) {
      console.warn(`⚠️ [leaveOrderRoom] User ${userId} non connecté`);
      return;
    }

    const socket = this.server.sockets.sockets.get(activeUser.socketId);
    if (socket) {
      socket.leave(roomName);
      console.log(`🚪 User ${userId} left room ${roomName}`);
    } else {
      console.warn(`⚠️ [leaveOrderRoom] Socket introuvable pour ${userId}`);
    }
  }

  @SubscribeMessage('updateDeliveryLocation')
  async handleUpdateDeliveryLocation(
    @MessageBody()
    data: {
      orderId: string;
      deliverId: string;
      latitude: number;
      longitude: number;
      speed?: number;
      heading?: number;
    },
  ) {
    console.log(
      `📍 [Gateway] Location update from deliver ${data.deliverId} for order ${data.orderId}`,
    );

    this.server.emit('internal:updateDeliveryLocation', data);

    return { success: true };
  }

  @SubscribeMessage('updateDeliveryStatus')
  async handleUpdateDeliveryStatus(
    @MessageBody()
    data: {
      orderId: string;
      deliverId: string;
      status: string;
      note?: string;
    },
  ) {
    console.log(
      `✅ [Gateway] Status update from deliver ${data.deliverId} for order ${data.orderId}: ${data.status}`,
    );

    this.server.emit('internal:updateDeliveryStatus', data);

    return { success: true };
  }

  // ============================================================
  // 1️⃣ LIVREUR — CONNECTER À LA ROOM
  // ============================================================
  @SubscribeMessage('livreur:connect')
  async handleLivreurConnect(
    @MessageBody() data: { orderId: string; deliverId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { orderId, deliverId } = data;
    console.log(`🔌 [Gateway] livreur:connect - ${deliverId} → order ${orderId}`);

    if (!orderId || !deliverId) {
      return { status: 'error', message: 'orderId et deliverId requis' };
    }

    try {
      const roomName = `order-${orderId}`;
      client.join(roomName);

      console.log(`✅ Livreur ${deliverId} joined room ${roomName}`);

      return {
        status: 'connected',
        message: 'Connecté à la room',
        data: { orderId, deliverId, roomName },
      };
    } catch (err: any) {
      console.error(`❌ Erreur connect: ${err.message}`);
      return { status: 'error', message: err.message };
    }
  }

  // ============================================================
  // 2️⃣ LIVREUR — DÉMARRER / ARRÊTER LE TRACKING
  // ============================================================
  @SubscribeMessage('livreur:tracking')
  async handleLivreurTracking(
    @MessageBody()
    data: { orderId: string; deliverId: string; action: 'start' | 'stop' },
    @ConnectedSocket() client: Socket,
  ) {
    const { orderId, deliverId, action } = data;
    console.log(`🚚 [Gateway] livreur:tracking - ${action} → order ${orderId}`);

    if (!orderId || !deliverId || !action) {
      return { status: 'error', message: 'orderId, deliverId et action requis' };
    }

    try {
      // Gestion du tracking actif en mémoire
      if (action === 'start') {
        if (!this.activeTrackings.has(deliverId)) {
          this.activeTrackings.set(deliverId, new Set());
        }
        this.activeTrackings.get(deliverId)!.add(orderId);

        const roomName = `order-${orderId}`;
        this.server.to(roomName).emit('trackingStarted', {
          orderId,
          deliverId,
          timestamp: new Date().toISOString(),
        });

        console.log(`✅ Tracking STARTED - ${deliverId} → order-${orderId}`);

        return {
          status: 'started',
          message: 'Tracking démarré',
          data: { orderId, deliverId, action: 'start' },
        };
      }

      if (action === 'stop') {
        if (this.activeTrackings.has(deliverId)) {
          this.activeTrackings.get(deliverId)!.delete(orderId);

          if (this.activeTrackings.get(deliverId)!.size === 0) {
            this.activeTrackings.delete(deliverId);
          }
        }

        const roomName = `order-${orderId}`;
        this.server.to(roomName).emit('trackingStopped', {
          orderId,
          deliverId,
          timestamp: new Date().toISOString(),
        });

        console.log(`✅ Tracking STOPPED - ${deliverId} → order-${orderId}`);

        return {
          status: 'stopped',
          message: 'Tracking arrêté',
          data: { orderId, deliverId, action: 'stop' },
        };
      }

      return { status: 'error', message: `Action inconnue : ${action}` };
    } catch (err: any) {
      console.error(`❌ Erreur tracking: ${err.message}`);
      return { status: 'error', message: err.message };
    }
  }

  // ============================================================
  // 3️⃣ LIVREUR — ENVOYER UNE POSITION
  // ============================================================
  @SubscribeMessage('livreur:position')
  async handleLivreurPosition(
    @MessageBody()
    data: {
      orderId: string;
      deliverId: string;
      latitude: number;
      longitude: number;
    },
  ) {
    const { orderId, deliverId, latitude, longitude } = data;
    console.log(`📍 [Gateway] livreur:position - ${deliverId} → order ${orderId}`);

    if (!orderId || !deliverId || latitude == null || longitude == null) {
      return { status: 'error', message: 'orderId, deliverId, latitude, longitude requis' };
    }

    // Vérifier que le tracking est actif
    const isTracking = this.activeTrackings.get(deliverId)?.has(orderId);
    if (!isTracking) {
      console.log(`⚠️ Tracking inactif pour ${deliverId} → order-${orderId}`);
      return {
        status: 'error',
        message: "Tracking inactif. Envoyez livreur:tracking (action='start') d'abord.",
      };
    }

    try {
      await this.deliveryService.updateLocation(orderId, {
        latitude,
        longitude,
      });

      return {
        status: 'position_received',
        message: 'Position enregistrée et diffusée',
        data: { orderId, deliverId, latitude, longitude },
      };
    } catch (err: any) {
      console.error(`❌ Erreur position: ${err.message}`);
      return { status: 'error', message: err.message };
    }
  }

  @SubscribeMessage('accept-ride')
  async handleAcceptRide(
    @MessageBody()
    data: { rideId: string; driverId: string; driverName: string },
    @ConnectedSocket() client: Socket,
  ) {
    const ride = await this.rideService.findOne(data.rideId);
    if (!ride) return client.emit('error', 'Course introuvable');
    if (ride.data.driverId) return client.emit('error', 'Course déjà acceptée');

    await this.rideService.updateDriver(ride.data.id, data.driverId);

    await this.notificationsService.sendNotificationToUser(
      ride.data.riderId,
      'Course acceptée',
      `Votre course a été acceptée par ${data.driverName}`,
      NotificationType.RIDE_ACCEPTED,
      { driverId: data.driverId },
    );

    try {
      await this.driverLocationService.setDriverBusy(data.driverId);
      console.log(`Chauffeur ${data.driverId} marqué comme occupé`);
    } catch (error) {
      console.error(
        'Erreur lors du marquage du chauffeur comme occupé:',
        error,
      );
    }

    client.broadcast
      .to('drivers')
      .emit('ride-cancelled', { rideId: ride.data.id });
    client.emit('ride-accepted', { rideId: ride.data.id });
  }
}