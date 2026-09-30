// notifications.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayConnection,
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
import { WsAuthHelper } from './utils/ws-auth.helper';

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
export class NotificationsGateway
  implements OnModuleInit, OnGatewayDisconnect, OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private activeUsers: ActiveUser[] = [];

  private activeTrackings: Map<string, Set<string>> = new Map();

  /**
   * 🗺️ Map inversée : userId → Set<roomName>
   * Permet de savoir dans quelles rooms est un utilisateur
   */
  private userRooms: Map<string, Set<string>> = new Map();

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

    // ✅ AJOUT : helper JWT
    private readonly wsAuthHelper: WsAuthHelper,
  ) { }

  onModuleInit() {
    console.log('✅ WebSocket Gateway initialized');
    this.server.emit('confirmation');
  }

  @SubscribeMessage('connection')
  async sendConfirm(
    @MessageBody() data: any,
    @ConnectedSocket() socket: Socket,
  ) {
    // ============================================================
    // 🔍 COURT-CIRCUIT : déjà identifié par handleConnection (mobile)
    // ============================================================
    if (socket.data?.userId) {
      console.log(`ℹ️ Socket ${socket.id} déjà identifié (user: ${socket.data.userId})`);

      const confirmation = {
        success: true,
        // ✅ Format mobile (à plat)
        userId: socket.data.userId,
        role: socket.data.role,
        fullName: socket.data.fullName,
        // ✅ Format riche
        user: {
          id: socket.data.userId,
          role: socket.data.role,
          fullName: socket.data.fullName,
        },
        socketId: socket.id,
        message: 'Déjà connecté',
        timestamp: new Date().toISOString(),
      };

      socket.emit('confirmation', confirmation);
      return confirmation;
    }

    // ============================================================
    // 📥 LOGS DE DEBUG
    // ============================================================
    console.log('═══════════════════════════════════════════');
    console.log('📥 [connection] DEBUG');
    console.log('   body.data            :', JSON.stringify(data));
    console.log('   handshake.auth       :', JSON.stringify(socket.handshake?.auth));
    console.log('   handshake.query.token:', JSON.stringify(socket.handshake?.query?.token));
    console.log('   headers.authorization:', JSON.stringify(socket.handshake?.headers?.authorization));
    console.log('═══════════════════════════════════════════');

    // ============================================================
    // 🔑 EXTRACTION DU TOKEN (multi-sources via WsAuthHelper)
    // ============================================================
    let token: string | null = null;

    // 1. Body SI c'est un JWT (pas un userId)
    if (typeof data === 'string' && data.split('.').length === 3) {
      token = data;
      console.log('🔑 Token trouvé dans body (string JWT)');
    } else if (
      data &&
      typeof data === 'object' &&
      data.token &&
      typeof data.token === 'string' &&
      data.token.split('.').length === 3
    ) {
      token = data.token;
      console.log('🔑 Token trouvé dans body (objet.token)');
    }

    // 2. Fallback : WsAuthHelper (auth.token, header Bearer, query.token)
    if (!token) {
      token = this.wsAuthHelper.extractToken(socket);
      if (token) console.log('🔑 Token trouvé via WsAuthHelper');
    }

    console.log('🔑 Token final :', token ? token.substring(0, 40) + '...' : '❌ AUCUN');
    console.log('🔑 Longueur   :', token?.length);

    // ============================================================
    // ❌ CAS 1 : Aucun token
    // ============================================================
    if (!token) {
      console.warn(`⚠️ Connection sans token - Socket ${socket.id}`);
      const errorResp = {
        success: false,
        message: 'Token requis',
      };
      socket.emit('connection-error', errorResp);
      return errorResp;
    }

    // ============================================================
    // ❌ CAS 2 : Token invalide
    // ============================================================
    const wsUser = await this.wsAuthHelper.validateToken(token);
    if (!wsUser) {
      console.warn(`⚠️ Token invalide - Socket ${socket.id}`);
      const errorResp = {
        success: false,
        message: 'Token invalide',
      };
      socket.emit('connection-error', errorResp);
      return errorResp;
    }

    // ============================================================
    // ✅ CAS 3 : Token valide → identification
    // ============================================================
    const userId = wsUser.id;
    console.log(`📡 Connection event received for user: ${userId}`);
    console.log(`   Socket ID: ${socket.id}`);

    const existingDriverIndex = this.activeUsers.findIndex(
      (user) => user.id === userId,
    );

    // Rejoindre la room perso
    socket.join(userId);
    this.addUserRoom(userId, userId);

    if (existingDriverIndex !== -1) {
      const oldSocketId = this.activeUsers[existingDriverIndex].socketId;
      if (oldSocketId === socket.id) {
        console.log(`ℹ️ User ${userId} already connected with same socket`);
      } else {
        this.activeUsers[existingDriverIndex].socketId = socket.id;
        console.log(`🔄 User ${userId} reconnected (old: ${oldSocketId}, new: ${socket.id})`);
      }
      socket.data.userId = userId;
      socket.data.role = wsUser.role;
      socket.data.fullName = wsUser.fullName || undefined;
    } else {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });
      if (user) {
        socket.data.userId = userId;
        socket.data.role = wsUser.role || user.role;
        socket.data.fullName = wsUser.fullName || user.fullName;

        this.activeUsers.push({
          id: userId,
          socketId: socket.id,
        });
        console.log(`🔌 User ${userId} connected (${socket.data.fullName}, role: ${socket.data.role})`);
      } else {
        console.warn(`⚠️ User ${userId} introuvable en base`);
        const errorResp = {
          success: false,
          message: 'Utilisateur introuvable',
        };
        socket.emit('connection-error', errorResp);
        return errorResp;
      }
    }

    // ============================================================
    // 📢 BROADCAST + CONFIRMATION
    // ============================================================
    this.broadcastUsers();

    const confirmation = {
      success: true,
      // ✅ Format mobile (à plat)
      userId: socket.data.userId,
      role: socket.data.role,
      fullName: socket.data.fullName,
      // ✅ Format riche
      user: {
        id: socket.data.userId,
        role: socket.data.role,
        fullName: socket.data.fullName,
      },
      socketId: socket.id,
      message: 'Connexion réussie',
      timestamp: new Date().toISOString(),
    };

    socket.emit('confirmation', confirmation);
    console.log(`✅ Confirmation sent to ${userId} :`, JSON.stringify(confirmation));

    return confirmation;
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

      // ✅ AJOUT : nettoyer la Map inversée
      this.userRooms.delete(userId);

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

    // ✅ AJOUT : nettoyer la Map inversée
    this.userRooms.delete(userId);

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
    // ✅ AJOUT : tracer la room
    const userId = client.data?.userId;
    if (userId) this.addUserRoom(userId, roomName);
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
    // ✅ AJOUT : retirer de la Map inversée
    const userId = client.data?.userId;
    if (userId) this.removeUserRoom(userId, roomName);
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

  // ============================================================
  // 🗺️ HELPERS : gestion de la Map inversée userRooms
  // ============================================================
  private addUserRoom(userId: string, roomName: string): void {
    if (!userId) return;
    if (!this.userRooms.has(userId)) {
      this.userRooms.set(userId, new Set());
    }
    this.userRooms.get(userId)!.add(roomName);
  }

  private removeUserRoom(userId: string, roomName: string): void {
    if (!userId) return;
    const rooms = this.userRooms.get(userId);
    if (!rooms) return;
    rooms.delete(roomName);
    if (rooms.size === 0) this.userRooms.delete(userId);
  }

  /**
   * 🔍 API publique : dans quelles rooms est un user ?
   */
  getUserRooms(userId: string): string[] {
    return Array.from(this.userRooms.get(userId) ?? []);
  }

  /**
   * 🔍 API publique : snapshot global userId → rooms
   */
  getAllUserRooms(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [userId, rooms] of this.userRooms.entries()) {
      result[userId] = Array.from(rooms);
    }
    return result;
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
  async handleConnection(client: Socket) {
    console.log('═══════════════════════════════════════════');
    console.log(`🔌 Nouveau socket : ${client.id}`);
    console.log('   auth            :', JSON.stringify(client.handshake?.auth));
    console.log('   query.token     :', JSON.stringify(client.handshake?.query?.token));
    console.log('   headers.auth    :', JSON.stringify(client.handshake?.headers?.authorization));
    console.log('═══════════════════════════════════════════');

    // 🎯 Extraire le token (header Bearer, query, auth)
    const token = this.wsAuthHelper.extractToken(client);

    if (!token) {
      console.warn(`⚠️ Socket ${client.id} sans token → non identifié`);
      // ⚠️ On ne déconnecte PAS ici → on attend que le client envoie 'connection' si besoin
      // Ou on déconnecte :
      // client.emit('connection-error', { message: 'Token requis' });
      // client.disconnect(true);
      return;
    }

    // 🔐 Valider le JWT
    const wsUser = await this.wsAuthHelper.validateToken(token);
    if (!wsUser) {
      console.warn(`⚠️ Socket ${client.id} token invalide`);
      client.emit('connection-error', { message: 'Token invalide' });
      // client.disconnect(true);
      return;
    }

    // ✅ Token valide → identifier le socket
    const userId = wsUser.id;

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      console.warn(`⚠️ User ${userId} introuvable en base`);
      client.emit('connection-error', { message: 'Utilisateur introuvable' });
      return;
    }

    // 🔥 Stocker les infos sur le socket
    client.data.userId = userId;
    client.data.role = wsUser.role || user.role;
    client.data.fullName = wsUser.fullName || user.fullName;

    // Rejoindre la room perso
    client.join(userId);
    this.addUserRoom(userId, userId);

    // Gérer la reconnexion
    const existingIndex = this.activeUsers.findIndex((u) => u.id === userId);
    if (existingIndex !== -1) {
      const oldSocketId = this.activeUsers[existingIndex].socketId;
      if (oldSocketId !== client.id) {
        this.activeUsers[existingIndex].socketId = client.id;
        console.log(`🔄 User ${userId} reconnected (old: ${oldSocketId}, new: ${client.id})`);
      }
    } else {
      this.activeUsers.push({ id: userId, socketId: client.id });
      console.log(`🔌 User ${userId} connected (${client.data.fullName}, role: ${client.data.role})`);
    }

    this.broadcastUsers();

    // 📢 Émettre la confirmation (format mobile : à plat + format riche)
    const confirmation = {
      success: true,
      // ✅ Format mobile app (à plat)
      userId,
      role: client.data.role,
      fullName: client.data.fullName,
      // ✅ Format riche (pour ton front web)
      user: {
        id: userId,
        role: client.data.role,
        fullName: client.data.fullName,
      },
      socketId: client.id,
      message: 'Connexion réussie',
      timestamp: new Date().toISOString(),
    };

    client.emit('confirmation', confirmation);
    console.log(`✅ Confirmation sent to ${userId} :`, JSON.stringify(confirmation));
    console.log('═══════════════════════════════════════════');
  }


  async sendDeliveryLocation(
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
      direction?: {
        polyline: string | null;
        steps: any[];
        destination: { latitude: number; longitude: number };
      };
    },
  ) {
    const roomName = `order-${orderId}`;

    // 🔍 DEBUG : combien de sockets dans la room ?
    const sockets = await this.server.in(roomName).fetchSockets();
    console.log(`📍 [sendDeliveryLocation] Room ${roomName} → ${sockets.length} socket(s)`);

    if (sockets.length === 0) {
      console.warn(`⚠️ PERSONNE dans la room ${roomName} → emit dans le vide`);
    } else {
      sockets.forEach((s: any) => {
        console.log(`   → socket ${s.id} | userId=${s.data?.userId} | role=${s.data?.role}`);
      });
    }

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

  private parseBody<T = any>(data: any): T | null {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data) as T;
      } catch (err) {
        console.log('❌ Impossible de parser data:', err);
        return null;
      }
    }
    if (typeof data === 'object' && data !== null) {
      return data as T;
    }
    return null;
  }

  @SubscribeMessage('join-order')
  async handleJoinOrderTracking(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    console.log(client)
    const payload = this.parseBody<{ orderId: string }>(data);
    if (!payload?.orderId) {
      return { success: false, message: 'orderId est requis' };
    }

    // 🚫 VÉRIFICATION : le client doit être identifié
    const userId = client.data?.userId;
    if (!userId) {
      console.warn(`🚫 [join-order] Socket ${client.id} NON identifié → envoie "connection" d'abord`);
      console.warn(`   socket.data = ${JSON.stringify(client.data)}`);

      client.emit('join-order-error', {
        success: false,
        message: "Vous devez d'abord envoyer l'event 'connection' avec un JWT valide",
        code: 'NOT_AUTHENTICATED',
      });

      return {
        success: false,
        message: "Vous devez d'abord envoyer l'event 'connection' avec un JWT valide",
        code: 'NOT_AUTHENTICATED',
      };
    }

    const roomName = `order-${payload.orderId}`;
    client.join(roomName);
    this.addUserRoom(userId, roomName);
    console.log(`🔌 Client ${client.id} (user: ${userId}) joined order room: ${roomName}`);

    const usersInRoom = await this.getUsersInOrderRoom(payload.orderId);

    client.emit('order-joined', {
      success: true,
      room: roomName,
      orderId: payload.orderId,
      users: usersInRoom,
      userCount: usersInRoom.length,
    });

    client.to(roomName).emit('order-user-joined', {
      success: true,
      room: roomName,
      orderId: payload.orderId,
      userId: userId,
      socketId: client.id,
      userCount: usersInRoom.length,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      room: roomName,
      users: usersInRoom,
      userCount: usersInRoom.length,
    };
  }

  @SubscribeMessage('leave-order')
  handleLeaveOrderTracking(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    const payload = this.parseBody<{ orderId: string }>(data);
    if (!payload?.orderId) {
      return { success: false, message: 'orderId est requis' };
    }

    const roomName = `order-${payload.orderId}`;
    client.leave(roomName);
    // ✅ AJOUT : retirer de la Map inversée
    const userId = client.data?.userId;
    if (userId) this.removeUserRoom(userId, roomName);
    console.log(`🔌 Client ${client.id} left order room: ${roomName}`);

    client.emit('order-left', {
      success: true,
      room: roomName,
      orderId: payload.orderId,
    });

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
      // ✅ AJOUT : tracer dans la Map inversée
      this.addUserRoom(userId, roomName);
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
      // ✅ AJOUT : retirer de la Map inversée
      this.removeUserRoom(userId, roomName);
      console.log(`🚪 User ${userId} left room ${roomName}`);
    } else {
      console.warn(`⚠️ [leaveOrderRoom] Socket introuvable pour ${userId}`);
    }
  }

  @SubscribeMessage('updateDeliveryLocation')
  async handleUpdateDeliveryLocation(
    @MessageBody() data: any,
  ) {
    const payload = this.parseBody<{
      orderId: string;
      deliverId: string;
      latitude: number;
      longitude: number;
      speed?: number;
      heading?: number;
    }>(data);

    if (!payload?.orderId || !payload?.deliverId || payload.latitude == null || payload.longitude == null) {
      return { success: false, message: 'orderId, deliverId, latitude, longitude requis' };
    }

    console.log(
      `📍 [Gateway] Location update from deliver ${payload.deliverId} for order ${payload.orderId}`,
    );

    this.server.emit('internal:updateDeliveryLocation', payload);

    return { success: true };
  }

  @SubscribeMessage('updateDeliveryStatus')
  async handleUpdateDeliveryStatus(
    @MessageBody() data: any,
  ) {
    const payload = this.parseBody<{
      orderId: string;
      deliverId: string;
      status: string;
      note?: string;
    }>(data);

    if (!payload?.orderId || !payload?.deliverId || !payload?.status) {
      return { success: false, message: 'orderId, deliverId, status requis' };
    }

    console.log(
      `✅ [Gateway] Status update from deliver ${payload.deliverId} for order ${payload.orderId}: ${payload.status}`,
    );

    this.server.emit('internal:updateDeliveryStatus', payload);

    return { success: true };
  }

  // ============================================================
  // 1️⃣ LIVREUR — CONNECTER À LA ROOM
  // ============================================================
  @SubscribeMessage('livreur:connect')
  async handleLivreurConnect(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    const payload = this.parseBody<{ orderId: string }>(data);

    // 🔐 Récupérer deliverId depuis le socket (JWT déjà validé)
    const deliverId = client.data?.userId;
    if (!deliverId) {
      return { status: 'error', message: 'Non authentifié' };
    }

    if (!payload?.orderId) {
      return { status: 'error', message: 'orderId requis' };
    }

    const { orderId } = payload;
    console.log(`🔌 [Gateway] livreur:connect - ${deliverId} → order ${orderId}`);

    try {
      const roomName = `order-${orderId}`;
      client.join(roomName);
      // ✅ AJOUT : tracer la room
      this.addUserRoom(deliverId, roomName);

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
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    const payload = this.parseBody<{ orderId: string; action: 'start' | 'stop' }>(data);

    // 🔐 Récupérer deliverId depuis le socket
    const deliverId = client.data?.userId;
    if (!deliverId) {
      return { status: 'error', message: 'Non authentifié' };
    }

    if (!payload?.orderId || !payload?.action) {
      return { status: 'error', message: 'orderId et action requis' };
    }

    const { orderId, action } = payload;
    console.log(`🚚 [Gateway] livreur:tracking - ${action} → order ${orderId} | deliver=${deliverId}`);

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
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    const payload = this.parseBody<{
      orderId: string;
      latitude: number;
      longitude: number;
    }>(data);

    // 🔐 Récupérer deliverId depuis le socket
    const deliverId = client.data?.userId;
    if (!deliverId) {
      return { status: 'error', message: 'Non authentifié' };
    }

    if (!payload?.orderId || payload.latitude == null || payload.longitude == null) {
      return { status: 'error', message: 'orderId, latitude, longitude requis' };
    }

    const { orderId, latitude, longitude } = payload;
    console.log(`📍 [Gateway] livreur:position - ${deliverId} → order ${orderId}`);

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
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    const payload = this.parseBody<{ rideId: string; driverId: string; driverName: string }>(data);
    if (!payload?.rideId || !payload?.driverId || !payload?.driverName) {
      return client.emit('error', 'rideId, driverId et driverName requis');
    }

    const ride = await this.rideService.findOne(payload.rideId);
    if (!ride) return client.emit('error', 'Course introuvable');
    if (ride.data.driverId) return client.emit('error', 'Course déjà acceptée');

    await this.rideService.updateDriver(ride.data.id, payload.driverId);

    await this.notificationsService.sendNotificationToUser(
      ride.data.riderId,
      'Course acceptée',
      `Votre course a été acceptée par ${payload.driverName}`,
      NotificationType.RIDE_ACCEPTED,
      { driverId: payload.driverId },
    );

    try {
      await this.driverLocationService.setDriverBusy(payload.driverId);
      console.log(`Chauffeur ${payload.driverId} marqué comme occupé`);
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

  // ============================================================
  // 📋 RÉCUPÉRATION DES UTILISATEURS DANS LES ROOMS
  // ============================================================

  /**
   * Récupérer tous les utilisateurs d'une room order
   */
  async getUsersInOrderRoom(orderId: string): Promise<any[]> {
    const roomName = `order-${orderId}`;

    try {
      const sockets = await this.server.in(roomName).fetchSockets();

      console.log(`📋 Room ${roomName} contient ${sockets.length} socket(s)`);

      // 🔥 DEBUG : afficher socket.data de chaque socket
      sockets.forEach((s: any) => {
        console.log(`   → socket ${s.id}`);
        console.log(`     data.userId   = ${s.data?.userId || 'undefined'}`);
        console.log(`     data.role     = ${s.data?.role || 'undefined'}`);
        console.log(`     data.fullName = ${s.data?.fullName || 'undefined'}`);
        console.log(`     data (complet) = ${JSON.stringify(s.data)}`);
      });

      return sockets.map((s: any) => ({
        socketId: s.id,
        userId: s.data?.userId || null,
        role: s.data?.role || null,
        fullName: s.data?.fullName || null,
      }));
    } catch (error) {
      console.error(`❌ Erreur getUsersInOrderRoom:`, error);
      return [];
    }
  }
  /**
   * Récupérer tous les utilisateurs d'une room company
   */
  async getUsersInCompanyRoom(companyId: string): Promise<any[]> {
    const roomName = `company-${companyId}`;

    try {
      const sockets = await this.server.in(roomName).fetchSockets();

      return sockets.map((s: any) => ({
        socketId: s.id,
        userId: s.data?.userId || null,
        role: s.data?.role || null,
        fullName: s.data?.fullName || null,
      }));
    } catch (error) {
      console.error(`❌ Erreur getUsersInCompanyRoom:`, error);
      return [];
    }
  }

  /**
   * Récupérer tous les chauffeurs connectés
   */
  async getConnectedDrivers(): Promise<any[]> {
    try {
      const sockets = await this.server.in('drivers').fetchSockets();

      return sockets.map((s: any) => ({
        socketId: s.id,
        userId: s.data?.userId || null,
        role: s.data?.role || null,
        fullName: s.data?.fullName || null,
      }));
    } catch (error) {
      console.error(`❌ Erreur getConnectedDrivers:`, error);
      return [];
    }
  }

  /**
   * Vérifier si un utilisateur est dans une room order
   */
  async isUserInOrderRoom(orderId: string, userId: string): Promise<boolean> {
    const users = await this.getUsersInOrderRoom(orderId);
    return users.some((u) => u.userId === userId);
  }

  /**
   * Compter le nombre d'utilisateurs dans une room order
   */
  async countUsersInOrderRoom(orderId: string): Promise<number> {
    const roomName = `order-${orderId}`;
    const sockets = await this.server.in(roomName).fetchSockets();
    return sockets.length;
  }
}