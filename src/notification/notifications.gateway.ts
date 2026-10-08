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

  // ============================================================
  // 🔑 HELPER : identifier un socket depuis un token JWT
  // ============================================================
  private async resolveUserFromToken(token: string): Promise<{
    userId: string;
    role?: string;
    fullName?: string;
  } | null> {
    const wsUser = await this.wsAuthHelper.validateToken(token);
    if (!wsUser) return null;

    const user = await this.userRepository.findOne({
      where: { id: wsUser.id },
    });
    if (!user) return null;

    return {
      userId: wsUser.id,
      role: wsUser.role || user.role,
      fullName: wsUser.fullName || user.fullName,
    };
  }

  // ============================================================
  // 🔑 HELPER : identifier un socket depuis un userId direct (ancien)
  // ============================================================
  private async resolveUserFromId(userId: string): Promise<{
    userId: string;
    role?: string;
    fullName?: string;
  } | null> {
    if (!userId) return null;

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) return null;

    return {
      userId,
      role: user.role,
      fullName: user.fullName,
    };
  }

  // ============================================================
  // 🔑 HELPER : finaliser l'identification (commun JWT + userId)
  // ============================================================
  private finalizeIdentification(
    socket: Socket,
    info: { userId: string; role?: string; fullName?: string },
  ): void {
    const { userId, role, fullName } = info;

    socket.data.userId = userId;
    socket.data.role = role;
    socket.data.fullName = fullName;

    socket.join(userId);
    this.addUserRoom(userId, userId);
    console.log(`🔌 Socket ${socket.id} joined room ${userId}`);

    const existingIndex = this.activeUsers.findIndex((u) => u.id === userId);
    if (existingIndex !== -1) {
      const oldSocketId = this.activeUsers[existingIndex].socketId;
      if (oldSocketId !== socket.id) {
        this.activeUsers[existingIndex].socketId = socket.id;
        console.log(`🔄 User ${userId} reconnected (old: ${oldSocketId}, new: ${socket.id})`);
      }
    } else {
      this.activeUsers.push({ id: userId, socketId: socket.id });
      console.log(`🔌 User ${userId} connected (${fullName}, role: ${role})`);
    }

    this.broadcastUsers();
  }

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
    // 🔍 COURT-CIRCUIT : déjà identifié par handleConnection
    // ============================================================
    if (socket.data?.userId) {
      console.log(`ℹ️ Socket ${socket.id} déjà identifié (user: ${socket.data.userId})`);

      const confirmation = {
        success: true,
        userId: socket.data.userId,
        role: socket.data.role,
        fullName: socket.data.fullName,
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

    console.log('═══════════════════════════════════════════');
    console.log('📥 [connection] DEBUG');
    console.log('   body.data            :', JSON.stringify(data));
    console.log('   handshake.auth       :', JSON.stringify(socket.handshake?.auth));
    console.log('   handshake.query.token:', JSON.stringify(socket.handshake?.query?.token));
    console.log('   headers.authorization:', JSON.stringify(socket.handshake?.headers?.authorization));
    console.log('═══════════════════════════════════════════');

    // ============================================================
    // 1️⃣ TENTATIVE JWT (nouveau système — prioritaire)
    // ============================================================
    let token: string | null = null;

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

    if (!token) {
      token = this.wsAuthHelper.extractToken(socket);
      if (token) console.log('🔑 Token trouvé via WsAuthHelper');
    }

    if (token) {
      const info = await this.resolveUserFromToken(token);
      if (info) {
        console.log(`✅ [connection] JWT valide → user ${info.userId}`);
        this.finalizeIdentification(socket, info);

        const confirmation = {
          success: true,
          userId: info.userId,
          role: info.role,
          fullName: info.fullName,
          user: {
            id: info.userId,
            role: info.role,
            fullName: info.fullName,
          },
          socketId: socket.id,
          message: 'Connexion réussie',
          timestamp: new Date().toISOString(),
        };

        socket.emit('confirmation', confirmation);
        console.log(`✅ Confirmation sent to ${info.userId}`);
        return confirmation;
      }
      console.warn(`⚠️ [connection] JWT invalide → fallback userId`);
    }

    // ============================================================
    // 2️⃣ FALLBACK : userId direct (ancien système)
    // ============================================================
    let directUserId: string | null = null;

    if (typeof data === 'string' && data.split('.').length !== 3) {
      directUserId = data.trim();
    } else if (data && typeof data === 'object') {
      directUserId = data.userId || data.id || data.user?.id || null;
    }

    if (directUserId) {
      console.log(`🔑 [connection] userId direct fourni: ${directUserId}`);

      const info = await this.resolveUserFromId(directUserId);
      if (info) {
        console.log(`✅ [connection] userId valide → user ${info.userId}`);
        this.finalizeIdentification(socket, info);

        const confirmation = {
          success: true,
          userId: info.userId,
          role: info.role,
          fullName: info.fullName,
          user: {
            id: info.userId,
            role: info.role,
            fullName: info.fullName,
          },
          socketId: socket.id,
          message: 'Connexion réussie',
          timestamp: new Date().toISOString(),
        };

        socket.emit('confirmation', confirmation);
        console.log(`✅ Confirmation sent to ${info.userId}`);
        return confirmation;
      }
      console.warn(`⚠️ [connection] userId ${directUserId} introuvable en base`);
    }

    // ============================================================
    // ❌ AUCUN MODE D'IDENTIFICATION N'A FONCTIONNÉ
    // ============================================================
    console.warn(`⚠️ [connection] Impossible d'identifier le socket ${socket.id}`);
    const errorResp = {
      success: false,
      message: 'Token ou userId requis',
    };
    socket.emit('connection-error', errorResp);
    return errorResp;
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

      // ✅ Vérifier s'il reste un autre socket actif pour cet user
      const stillConnected = this.activeUsers.some((u) => u.id === userId);

      if (!stillConnected) {
        console.log(`🧹 Dernier socket de ${userId} déconnecté → nettoyage`);

        // ✅ Nettoyer la Map inversée (rooms)
        this.userRooms.delete(userId);

        // ✅ Nettoyer les trackings actifs EN MÉMOIRE uniquement
        //    SANS émettre trackingStopped à la room
        //    → le livreur ne s'arrête PAS si un client se déconnecte
        this.activeTrackings.delete(userId);
      } else {
        const remainingSockets = this.activeUsers.filter((u) => u.id === userId);
        console.log(
          `ℹ️ User ${userId} a encore ${remainingSockets.length} socket(s) actif(s) → pas de nettoyage`,
        );
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

    const token = this.wsAuthHelper.extractToken(client);

    if (!token) {
      console.warn(`⚠️ Socket ${client.id} sans token → en attente de 'connection'`);
      // ⚠️ Ancien client : il enverra 'connection' avec userId
      return;
    }

    const info = await this.resolveUserFromToken(token);
    if (!info) {
      console.warn(`⚠️ Socket ${client.id} token invalide`);
      client.emit('connection-error', { message: 'Token invalide' });
      return;
    }

    // ✅ Identifié via handshake → on finalise TOUT DE SUITE
    this.finalizeIdentification(client, info);

    const confirmation = {
      success: true,
      userId: info.userId,
      role: info.role,
      fullName: info.fullName,
      user: {
        id: info.userId,
        role: info.role,
        fullName: info.fullName,
      },
      socketId: client.id,
      message: 'Connexion réussie',
      timestamp: new Date().toISOString(),
    };

    client.emit('confirmation', confirmation);
    console.log(`✅ Confirmation sent to ${info.userId} (via handshake)`);
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
        origin: { latitude: number; longitude: number };
        polyline: string | null;
        steps: any[];
        destination: { latitude: number; longitude: number };
      };
    },
  ) {
    const roomName = `order-${orderId}`;

    try {
      // ============================================================
      // 🛡️ GARDE-FOU : server initialisé ?
      // ============================================================
      if (!this.server) {
        console.warn(`⚠️ [sendDeliveryLocation] this.server undefined - skip`);
        return;
      }

      // ============================================================
      // 🔍 VÉRIFICATION : la room existe et contient des sockets ?
      //    ✅ API officielle Socket.IO (safe, async)
      // ============================================================
      const sockets = await this.server.in(roomName).fetchSockets();

      if (!sockets || sockets.length === 0) {
        console.warn(`⚠️ [sendDeliveryLocation] Room ${roomName} vide ou inexistante`);
        console.warn(`   → Aucun envoi car personne n'a fait join-order avec cet orderId`);
        return;
      }

      // ============================================================
      // 📋 LOGS : lister les sockets présents dans la room
      // ============================================================
      console.log(`📍 [sendDeliveryLocation] Room ${roomName} → ${sockets.length} socket(s)`);

      sockets.forEach((s: any) => {
        console.log(`   → socket ${s.id} | userId=${s.data?.userId} | role=${s.data?.role}`);
      });

      // ============================================================
      // 📤 ENVOI STRICTEMENT À CETTE ROOM (order-${orderId})
      // ============================================================
      this.server.to(roomName).emit('deliveryLocation', {
        ...payload,
        timestamp: new Date().toISOString(),
      });

      console.log(`📍 deliveryLocation envoyé UNIQUEMENT à la room ${roomName}`);
    } catch (err: any) {
      // ============================================================
      // 🛡️ NE JAMAIS laisser crasher le process
      // ============================================================
      console.error(`❌ [sendDeliveryLocation] Erreur:`, err?.message);
    }
  }

  async sendDeliveryStatusUpdate(
    orderId: string,
    payload: {
      orderId: string;
      status: string;
      note?: string;
    },
  ) {
    const roomName = `order-${orderId}`;

    try {
      // ============================================================
      // 🛡️ GARDE-FOU : server initialisé ?
      // ============================================================
      if (!this.server) {
        console.warn(`⚠️ [sendDeliveryStatusUpdate] this.server undefined - skip`);
        return;
      }

      // ============================================================
      // 🔍 VÉRIFICATION : la room existe et contient des sockets ?
      //    ✅ API officielle Socket.IO (safe, async)
      // ============================================================
      const sockets = await this.server.in(roomName).fetchSockets();

      if (!sockets || sockets.length === 0) {
        console.warn(`⚠️ [sendDeliveryStatusUpdate] Room ${roomName} vide ou inexistante`);
        console.warn(`   → Aucun envoi car personne n'a fait join-order avec cet orderId`);
        return;
      }

      // ============================================================
      // 📤 ENVOI STRICTEMENT À CETTE ROOM
      // ============================================================
      this.server.to(roomName).emit('deliveryStatusUpdate', {
        ...payload,
        timestamp: new Date().toISOString(),
      });

      console.log(`✅ deliveryStatusUpdate envoyé UNIQUEMENT à la room ${roomName}`);
    } catch (err: any) {
      // ============================================================
      // 🛡️ NE JAMAIS laisser crasher le process
      // ============================================================
      console.error(`❌ [sendDeliveryStatusUpdate] Erreur:`, err?.message);
    }
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
    const payload = this.parseBody<{ orderId: string }>(data);
    if (!payload?.orderId) {
      return { success: false, message: 'orderId est requis' };
    }

    // ============================================================
    // 🚫 VÉRIFICATION 1 : le client doit être identifié
    // ============================================================
    const userId = client.data?.userId;
    const userRole = client.data?.role;

    if (!userId) {
      console.warn(`🚫 [join-order] Socket ${client.id} NON identifié`);

      const errResp = {
        success: false,
        code: 'NOT_AUTHENTICATED',
        message: "Vous devez d'abord envoyer l'event 'connection' avec un JWT valide",
      };
      client.emit('join-order-error', errResp);
      return errResp;
    }

    const { orderId } = payload;

    // ============================================================
    // 🚫 VÉRIFICATION 2 : l'orderId doit exister en base
    // ============================================================
    let assignment: any = null;
    try {
      assignment = await this.deliveryService.findAssignmentByOrderId(orderId);

      if (!assignment) {
        console.warn(`🚫 [join-order] Aucune affectation pour orderId = ${orderId}`);

        const errResp = {
          success: false,
          code: 'ORDER_NOT_FOUND',
          message: `Aucune affectation active pour la commande ${orderId}`,
          orderId,
        };
        client.emit('join-order-error', errResp);
        return errResp;
      }

      console.log(`✅ [join-order] Affectation trouvée pour ${orderId}`);
    } catch (err: any) {
      console.warn(`🚫 [join-order] Erreur: ${err.message}`);

      const errResp = {
        success: false,
        code: 'ORDER_NOT_FOUND',
        message: `Aucune affectation active pour la commande ${orderId}`,
        orderId,
      };
      client.emit('join-order-error', errResp);
      return errResp;
    }

    // ============================================================
    // 🔐 VÉRIFICATION 3 : contrôle d'accès STRICT
    // ============================================================
    const orderInfo = await this.deliveryService.getOrderAccessInfo(orderId);

    if (!orderInfo) {
      const errResp = {
        success: false,
        code: 'ORDER_NOT_FOUND',
        message: `Commande introuvable`,
        orderId,
      };
      client.emit('join-order-error', errResp);
      return errResp;
    }

    const roleUpper = String(userRole).toUpperCase();

    // 🔓 ADMIN : accès total
    if (roleUpper === 'SUPER ADMIN' || roleUpper === 'SUPER_ADMIN' || roleUpper === 'ADMIN') {
      console.log(`🔓 [join-order] ADMIN ${userId} → accès total`);
    }
    // 👤 CLIENT : doit être LE client de la commande
    else if (roleUpper === 'CUSTOMER' || roleUpper === 'CLIENT') {
      if (orderInfo.clientId !== userId) {
        console.warn(`🚫 [join-order] CLIENT ${userId} n'est PAS le client de ${orderId}`);

        const errResp = {
          success: false,
          code: 'ACCESS_DENIED',
          message: "Vous n'êtes pas le client de cette commande",
          orderId,
        };
        client.emit('join-order-error', errResp);
        return errResp;
      }
      console.log(`✅ [join-order] CLIENT ${userId} autorisé`);
    }
    // 🚚 LIVREUR : doit être LE livreur affecté
    else if (roleUpper === 'DELIVER' || roleUpper === 'DELIVERY' || roleUpper === 'LIVREUR') {
      if (orderInfo.deliverId !== userId) {
        console.warn(`🚫 [join-order] LIVREUR ${userId} n'est PAS affecté à ${orderId}`);

        const errResp = {
          success: false,
          code: 'ACCESS_DENIED',
          message: "Vous n'êtes pas affecté à cette commande",
          orderId,
        };
        client.emit('join-order-error', errResp);
        return errResp;
      }
      console.log(`✅ [join-order] LIVREUR ${userId} autorisé`);
    }
    // ❌ Autre rôle : refus
    else {
      const errResp = {
        success: false,
        code: 'ACCESS_DENIED',
        message: "Votre rôle ne permet pas d'accéder à cette commande",
        orderId,
      };
      client.emit('join-order-error', errResp);
      return errResp;
    }

    // ============================================================
    // 🔌 REJOINDRE LA ROOM
    // ============================================================
    const roomName = `order-${orderId}`;
    client.join(roomName);
    this.addUserRoom(userId, roomName);
    console.log(`🔌 Client ${client.id} (user: ${userId}, role: ${userRole}) joined room ${roomName}`);

    // ============================================================
    // ✨ CHARGER LA COMMANDE COMPLÈTE (cette commande uniquement)
    // ============================================================
    let orderData: any = null;
    try {
      const result = await this.deliveryService.getDeliverAssignments(userId, orderId);
      if (result?.data && Array.isArray(result.data)) {
        orderData = result.data[0] || null;
      }
    } catch (err: any) {
      console.warn(`⚠️ [join-order] Impossible de charger la commande: ${err.message}`);
    }

    // ============================================================
    // ✅ NOUVEAU : VÉRIFIER SI LE TRACKING EST DÉJÀ ACTIF EN MÉMOIRE
    // ============================================================
    // On regarde si N'IMPORTE QUEL livreur a un tracking actif sur cet orderId.
    // → Utile pour :
    //    • Le LIVREUR qui revient sur l'écran → il retrouve son tracking allumé
    //    • Le CLIENT qui rejoint après → il voit le tracking actif sans clic
    let trackingIsActive = false;
    let activeDeliverIdForOrder: string | null = null;

    for (const [deliverId, orderSet] of this.activeTrackings.entries()) {
      if (orderSet.has(orderId)) {
        trackingIsActive = true;
        activeDeliverIdForOrder = deliverId;
        break;
      }
    }

    console.log(
      `🔍 [join-order] Tracking actif pour ${orderId} ? ${trackingIsActive}` +
      (activeDeliverIdForOrder ? ` (par ${activeDeliverIdForOrder})` : ''),
    );

    // ✅ Injecter le tracking dans orderData pour que le front
    //    puisse lire `freshOrder.tracking.isActive` (déjà géré côté front)
    if (orderData) {
      orderData.tracking = {
        ...(orderData.tracking || {}),
        isActive: trackingIsActive,
        deliverId: activeDeliverIdForOrder,
      };
    }

    // ============================================================
    // 📤 RÉPONSE PRIVÉE AU CLIENT
    // ============================================================
    client.emit('order-joined', {
      success: true,
      room: roomName,
      orderId,
      users: [],
      userCount: 0,
      order: orderData,
      tracking: {
        isActive: trackingIsActive,
        deliverId: activeDeliverIdForOrder,
      },
    });

    // ============================================================
    // 📢 BROADCAST AUX AUTRES MEMBRES DE LA ROOM (SAUF l'émetteur)
    // ============================================================
    // client.to(roomName).emit('order-user-joined', {
    //   success: true,
    //   room: roomName,
    //   orderId,
    //   userId,
    //   role: userRole,
    //   socketId: client.id,
    //   userCount: 0,
    //   timestamp: new Date().toISOString(),
    // });

    // ============================================================
    // 🔙 RETOUR
    // ============================================================
    return {
      success: true,
      room: roomName,
      users: [],
      userCount: 0,
      order: orderData,
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

    // ✅ Retirer de la Map inversée
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

  async sendOrderJoinedToRoom(
    orderId: string,
    payload: {
      orderId: string;
      order: any;
    },
  ): Promise<void> {
    const roomName = `order-${orderId}`;

    try {
      if (!this.server) {
        console.warn(`⚠️ [sendOrderJoinedToRoom] this.server undefined - skip`);
        return;
      }

      const sockets = await this.server.in(roomName).fetchSockets();

      if (!sockets || sockets.length === 0) {
        console.warn(`⚠️ [sendOrderJoinedToRoom] Room ${roomName} vide`);
        return;
      }

      console.log(`📢 [sendOrderJoinedToRoom] Room ${roomName} → ${sockets.length} socket(s)`);

      // ✅ Vérifier si tracking actif en mémoire
      let trackingIsActive = false;
      let activeDeliverIdForOrder: string | null = null;
      for (const [deliverId, orderSet] of this.activeTrackings.entries()) {
        if (orderSet.has(orderId)) {
          trackingIsActive = true;
          activeDeliverIdForOrder = deliverId;
          break;
        }
      }

      // ✅ Émettre EXACTEMENT le même format que handleJoinOrderTracking
      this.server.to(roomName).emit('order-joined', {
        success: true,
        room: roomName,
        orderId,
        users: [],
        userCount: 0,
        order: payload.order,
        tracking: {
          isActive: trackingIsActive,
          deliverId: activeDeliverIdForOrder,
        },
        timestamp: new Date().toISOString(),
      });

      console.log(`✅ order-joined (update) envoyé à la room ${roomName}`);
    } catch (err: any) {
      console.error(`❌ [sendOrderJoinedToRoom] Erreur:`, err?.message);
    }
  }
  // ============================================================
  // 🔌 CONNECTER UN LIVREUR À UNE ROOM ORDER (par userId)
  // ============================================================
  joinOrderRoom(userId: string, orderId: string): void {
    const roomName = `order-${orderId}`;

    if (!this.server) {
      console.warn(`⚠️ [joinOrderRoom] this.server undefined`);
      return;
    }

    const activeUser = this.activeUsers.find((u) => u.id === userId);

    if (!activeUser) {
      console.warn(`⚠️ [joinOrderRoom] User ${userId} non connecté`);
      return;
    }

    try {
      // ✅ METHODE ROBUSTE : socketsJoin permet de faire rejoindre une room
      // à un socket par son ID, sans accéder à this.server.sockets.sockets
      this.server.in(activeUser.socketId).socketsJoin(roomName);

      this.addUserRoom(userId, roomName);
      console.log(`🔌 User ${userId} joined room ${roomName} (via socketsJoin)`);
    } catch (err: any) {
      console.warn(`⚠️ [joinOrderRoom] Erreur: ${err.message}`);
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

    // ✅ Récupérer deliverId depuis le token (vérifie aussi le rôle)
    const deliverId = this.wsAuthHelper.extractDeliverId(client);
    if (!deliverId) {
      const errResp = {
        status: 'error',
        code: 'NOT_A_DELIVER',
        message: 'Seul un livreur authentifié peut se connecter à une room',
      };
      client.emit('livreur:connect-error', errResp);
      return errResp;
    }

    if (!payload?.orderId) {
      const errResp = {
        status: 'error',
        code: 'INVALID_PAYLOAD',
        message: 'orderId requis',
      };
      client.emit('livreur:connect-error', errResp);
      return errResp;
    }

    const { orderId } = payload;
    console.log(`🔌 [Gateway] livreur:connect - ${deliverId} → order ${orderId}`);

    try {
      // ============================================================
      // 🔐 CONTRÔLE D'ACCÈS : le livreur est-il bien affecté à CETTE commande ?
      // ============================================================
      const orderInfo = await this.deliveryService.getOrderAccessInfo(orderId);

      if (!orderInfo) {
        const errResp = {
          status: 'error',
          code: 'ORDER_NOT_FOUND',
          message: `Commande ${orderId} introuvable`,
        };
        client.emit('livreur:connect-error', errResp);
        return errResp;
      }

      if (orderInfo.deliverId !== deliverId) {
        console.warn(
          `🚫 [livreur:connect] LIVREUR ${deliverId} N'EST PAS affecté à ${orderId} ` +
          `(affecté à: ${orderInfo.deliverId})`,
        );
        const errResp = {
          status: 'error',
          code: 'ACCESS_DENIED',
          message: "Vous n'êtes pas affecté à cette commande",
        };
        client.emit('livreur:connect-error', errResp);
        return errResp;
      }

      // ============================================================
      // 🔌 REJOINDRE LA ROOM
      // ============================================================
      const roomName = `order-${orderId}`;
      client.join(roomName);
      this.addUserRoom(deliverId, roomName);

      console.log(`✅ Livreur ${deliverId} joined room ${roomName}`);

      const successResp = {
        status: 'connected',
        message: 'Connecté à la room',
        data: { orderId, deliverId, roomName },
      };
      client.emit('livreur:connect-success', successResp);
      return successResp;
    } catch (err: any) {
      console.error(`❌ Erreur connect: ${err.message}`);
      const errResp = { status: 'error', message: err.message };
      client.emit('livreur:connect-error', errResp);
      return errResp;
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

    // ✅ Récupérer deliverId depuis le token
    const deliverId = this.wsAuthHelper.extractDeliverId(client);
    if (!deliverId) {
      const errResp = {
        status: 'error',
        code: 'NOT_A_DELIVER',
        message: 'Seul un livreur authentifié peut gérer le tracking',
      };
      client.emit('tracking-error', errResp);
      return errResp;
    }

    if (!payload?.orderId || !payload?.action) {
      const errResp = {
        status: 'error',
        code: 'INVALID_PAYLOAD',
        message: 'orderId et action requis',
      };
      client.emit('tracking-error', errResp);
      return errResp;
    }

    const { orderId, action } = payload;
    console.log(`🚚 [Gateway] livreur:tracking - ${action} → order ${orderId} | deliver=${deliverId}`);

    try {
      // ============================================================
      // 🔐 CONTRÔLE D'ACCÈS
      // ============================================================
      const orderInfo = await this.deliveryService.getOrderAccessInfo(orderId);

      if (!orderInfo) {
        const errResp = {
          status: 'error',
          code: 'ORDER_NOT_FOUND',
          message: `Commande ${orderId} introuvable`,
        };
        client.emit('tracking-error', errResp);
        return errResp;
      }

      if (orderInfo.deliverId !== deliverId) {
        console.warn(
          `🚫 [livreur:tracking] LIVREUR ${deliverId} N'EST PAS affecté à ${orderId} ` +
          `(affecté à: ${orderInfo.deliverId})`,
        );
        const errResp = {
          status: 'error',
          code: 'ACCESS_DENIED',
          message: "Vous n'êtes pas affecté à cette commande",
        };
        client.emit('tracking-error', errResp);
        return errResp;
      }

      // ============================================================
      // 🔌 S'assurer que le livreur est dans la room
      // ============================================================
      const roomName = `order-${orderId}`;
      client.join(roomName);
      this.addUserRoom(deliverId, roomName);

      // ============================================================
      // 📡 START / STOP
      // ============================================================
      if (action === 'start') {
        if (!this.activeTrackings.has(deliverId)) {
          this.activeTrackings.set(deliverId, new Set());
        }
        this.activeTrackings.get(deliverId)!.add(orderId);

        this.server.to(roomName).emit('trackingStarted', {
          orderId,
          deliverId,
          timestamp: new Date().toISOString(),
        });

        console.log(`✅ Tracking STARTED - ${deliverId} → order-${orderId}`);

        const successResp = {
          status: 'started',
          message: 'Tracking démarré',
          data: { orderId, deliverId, action: 'start' },
        };
        client.emit('tracking-started', successResp);
        return successResp;
      }

      if (action === 'stop') {
        if (this.activeTrackings.has(deliverId)) {
          this.activeTrackings.get(deliverId)!.delete(orderId);
          if (this.activeTrackings.get(deliverId)!.size === 0) {
            this.activeTrackings.delete(deliverId);
          }
        }

        this.server.to(roomName).emit('trackingStopped', {
          orderId,
          deliverId,
          timestamp: new Date().toISOString(),
        });

        console.log(`✅ Tracking STOPPED - ${deliverId} → order-${orderId}`);

        const successResp = {
          status: 'stopped',
          message: 'Tracking arrêté',
          data: { orderId, deliverId, action: 'stop' },
        };
        client.emit('tracking-stopped', successResp);
        return successResp;
      }

      const errResp = { status: 'error', code: 'INVALID_ACTION', message: `Action inconnue : ${action}` };
      client.emit('tracking-error', errResp);
      return errResp;
    } catch (err: any) {
      console.error(`❌ Erreur tracking: ${err.message}`);
      const errResp = { status: 'error', message: err.message };
      client.emit('tracking-error', errResp);
      return errResp;
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

    // ✅ Récupérer deliverId depuis le token
    const deliverId = this.wsAuthHelper.extractDeliverId(client);
    if (!deliverId) {
      const errResp = {
        status: 'error',
        code: 'NOT_A_DELIVER',
        message: 'Seul un livreur authentifié peut envoyer une position',
      };
      client.emit('position-error', errResp);
      return errResp;
    }

    if (!payload?.orderId || payload.latitude == null || payload.longitude == null) {
      const errResp = {
        status: 'error',
        code: 'INVALID_PAYLOAD',
        message: 'orderId, latitude, longitude requis',
      };
      client.emit('position-error', errResp);
      return errResp;
    }

    const { orderId, latitude, longitude } = payload;
    console.log('═══════════════════════════════════════════');
    console.log(`📍 [livreur:position]`);
    console.log(`   deliverId = ${deliverId}`);
    console.log(`   orderId   = ${orderId}`);
    console.log(`   lat/lng   = ${latitude}, ${longitude}`);
    console.log('═══════════════════════════════════════════');

    // ✅ Vérif 1 : tracking actif en mémoire
    const isTracking = this.activeTrackings.get(deliverId)?.has(orderId);
    if (!isTracking) {
      console.warn(`⚠️ Tracking inactif pour ${deliverId} → order-${orderId}`);
      const errResp = {
        status: 'error',
        code: 'TRACKING_INACTIVE',
        message: "Tracking inactif. Envoyez livreur:tracking (action='start') d'abord.",
      };
      client.emit('position-error', errResp);
      return errResp;
    }

    // ============================================================
    // ✅ Vérif 2 : le livreur est-il bien affecté à CETTE commande ?
    // ============================================================
    try {
      const orderInfo = await this.deliveryService.getOrderAccessInfo(orderId);

      if (!orderInfo || orderInfo.deliverId !== deliverId) {
        console.warn(
          `🚫 [livreur:position] LIVREUR ${deliverId} N'EST PAS affecté à ${orderId} ` +
          `(affecté à: ${orderInfo?.deliverId ?? 'inconnu'})`,
        );

        // 🔥 Stoppe le tracking fantôme en mémoire
        this.activeTrackings.get(deliverId)?.delete(orderId);

        const errResp = {
          status: 'error',
          code: 'ACCESS_DENIED',
          message: "Vous n'êtes pas affecté à cette commande",
          orderId,
          timestamp: new Date().toISOString(),
        };
        client.emit('position-error', errResp);
        return errResp;
      }
    } catch (accessErr: any) {
      console.error(`❌ [livreur:position] Erreur vérif accès: ${accessErr.message}`);
      const errResp = {
        status: 'error',
        code: 'ACCESS_CHECK_FAILED',
        message: 'Impossible de vérifier vos droits sur cette commande',
        orderId,
      };
      client.emit('position-error', errResp);
      return errResp;
    }

    // ============================================================
    // 🎯 APPEL DU SERVICE (avec deliverId pour double vérif)
    // ============================================================
    try {
      await this.deliveryService.updateLocation(orderId, {
        latitude,
        longitude,
        deliverId, // ✅ passe deliverId pour double vérif côté service
      });

      console.log(`✅ Position traitée avec succès pour order-${orderId}`);
      const successResp = {
        status: 'position_received',
        message: 'Position enregistrée et diffusée',
        data: { orderId, deliverId, latitude, longitude },
      };
      client.emit('position-success', successResp);
      return successResp;
    } catch (err: any) {
      console.error(`❌ Erreur position pour order-${orderId}: ${err.message}`);

      let code = 'UNKNOWN_ERROR';
      let message = err.message || 'Erreur inconnue';

      if (err.status === 404 || err.message?.includes('Aucune affectation active')) {
        code = 'ASSIGNMENT_NOT_FOUND';
        message = `Aucune affectation active pour la commande ${orderId}. Contactez le support.`;
      } else if (err.status === 403 || err.message?.includes("n'est pas affecté")) {
        code = 'ACCESS_DENIED';
        message = "Vous n'êtes pas affecté à cette commande";
      } else if (err.status === 400) {
        code = 'BAD_REQUEST';
      } else if (err.message?.includes('Google')) {
        code = 'GOOGLE_DIRECTIONS_ERROR';
      }

      const errResp = {
        status: 'error',
        code,
        message,
        orderId,
        timestamp: new Date().toISOString(),
      };

      client.emit('position-error', errResp);

      if (code === 'ASSIGNMENT_NOT_FOUND') {
        this.server.to(`order-${orderId}`).emit('deliveryPositionFailed', {
          orderId,
          deliverId,
          reason: 'ASSIGNMENT_NOT_FOUND',
          message,
          timestamp: new Date().toISOString(),
        });
      }

      return errResp;
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

  getActiveTrackings(deliverId: string): string[] {
    const trackings = this.activeTrackings.get(deliverId);
    if (!trackings) return [];
    return Array.from(trackings);
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