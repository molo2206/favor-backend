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
})
@Injectable()
export class NotificationsGateway implements OnModuleInit, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private activeUsers: ActiveUser[] = [];

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @Inject(forwardRef(() => RideService))
    private readonly rideService: RideService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    private readonly driverLocationService: DriverLocationService,
  ) {}

  onModuleInit() {
    console.log('✅ WebSocket Gateway initialized');
    this.server.emit('confirmation');
  }

  // Écouter l'événement 'connection' comme l'envoie le client
  @SubscribeMessage('connection')
  async sendConfirm(
    @MessageBody() userId: string,
    @ConnectedSocket() socket: Socket,
  ) {
    console.log(`📡 Connection event received for user: ${userId}`);

    const existingDriverIndex = this.activeUsers.findIndex(
      (user) => user.id === userId,
    );

    socket.join(userId);

    if (existingDriverIndex !== -1) {
      // Mettre à jour le socketId
      this.activeUsers[existingDriverIndex].socketId = socket.id;
      console.log(`🔄 User ${userId} reconnected`);
    } else if (userId) {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });
      if (user) {
        this.activeUsers.push({
          id: userId,
          socketId: socket.id,
        });
        console.log(`🔌 User ${userId} connected`);
      }
    }

    this.broadcastUsers();
    socket.emit('confirmation');
  }

  handleDisconnect(client: Socket) {
    const userIndex = this.activeUsers.findIndex(
      (user) => user.socketId === client.id,
    );

    if (userIndex !== -1) {
      const userId = this.activeUsers[userIndex].id;
      this.activeUsers.splice(userIndex, 1);
      console.log(`❌ User ${userId} disconnected`);
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

  // Méthode pour envoyer une notification à un utilisateur spécifique
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

  // Méthode pour envoyer une notification à une room
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

  // Méthode pour broadcaster à tous
  broadcastNotification(notification: any) {
    this.server.emit('notification', notification);
    console.log('📢 Broadcast notification to all');
  }

  private broadcastUsers() {
    const users = this.activeUsers.map((user) => user.id);
    this.server.emit('active-users', users);
  }

  // Méthode utilitaire pour obtenir les utilisateurs actifs
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

    // Émettre à la room de la compagnie
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
