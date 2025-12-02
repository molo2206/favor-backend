import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from 'src/users/entities/user.entity';

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://favor-privacy.vercel.app',
      'https://privacy.favorbusiness.com',
      'https://favor-help.vercel.app',
      'https://api-prod.favorbusiness.com',
      'https://admin.favorbusiness.com',
      'https://api.favorbusiness.com',
      'ws://localhost:5173',
      'ws://localhost:3000',
      'wss://favor-privacy.vercel.app',
      'wss://privacy.favorbusiness.com',
      'wss://favor-help.vercel.app',
      'wss://api-prod.favorbusiness.com',
      'wss://admin.favorbusiness.com',
      'wss://api.favorbusiness.com'
    ],
    credentials: true,
  },
})
@Injectable()
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  // Liste des utilisateurs actifs { userId -> socketId }
  private activeUsers: Map<string, string> = new Map();

  onModuleInit() {
    this.server.emit('confirmation')
    console.log('confirmation');
  }

  handleConnection(client: Socket) {
    console.log('Nouveau client connecté :', client.id);
  }

  handleDisconnect(client: Socket) {
    for (const [userId, socketId] of this.activeUsers.entries()) {
      if (socketId === client.id) {
        this.activeUsers.delete(userId);
        console.log(`Utilisateur ${userId} déconnecté`);
        break;
      }
    }
  }

  /** Identification de l'utilisateur et création d'un "channel" pour lui */
  @SubscribeMessage('connection')
  async handleUserConnect(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (!userId) return;

    this.activeUsers.set(userId, client.id);

    // Rejoindre une room correspondant au userId
    client.join(userId);

    console.log(`Utilisateur ${userId} connecté via socket ${client.id}`);

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) console.log(`Utilisateur ${userId} non trouvé dans la base`);

    client.emit('confirmation', { message: 'Connexion confirmée', userId });

    this.broadcastActiveUsers();
  }

  /** Déconnexion volontaire côté client */
  @SubscribeMessage('disconnect-user')
  handleUserDisconnect(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    this.activeUsers.delete(userId);
    client.leave(userId);
    client.disconnect();
    console.log(`Utilisateur ${userId} déconnecté manuellement`);
    this.broadcastActiveUsers();
  }

  /** Envoi notification ciblée à un utilisateur */
  sendNotificationToUser(userId: string, notification: any) {
    this.server.to(userId).emit('notification', notification);
    console.log(`Notification envoyée à ${userId}`);
  }

  /** Envoi notification à tous les sockets d'une room (ex: assemblyId) */
  sendNotificationToRoom(roomId: string, event: string, payload: any) {
    this.server.to(roomId).emit(event, payload);
    console.log(`Notification "${event}" envoyée à la room ${roomId}`);
  }

  /** Broadcast à tous les utilisateurs connectés */
  broadcastNotification(notification: any) {
    this.server.emit('notification', notification);
    console.log('Notification broadcast envoyée à tous les utilisateurs');
  }

  /** Diffuse la liste des utilisateurs actifs (optionnel) */
  private broadcastActiveUsers() {
    const users = Array.from(this.activeUsers.keys());
    this.server.emit('active-users', users);
  }
}
