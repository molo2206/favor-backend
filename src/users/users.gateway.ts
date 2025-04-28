/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*', // Autoriser tous les domaines pour le dev
  },
})
export class UsersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers: { [socketId: string]: string } = {}; // Suivi des utilisateurs connectés

  // Lorsqu'un utilisateur se connecte
  async handleConnection(client: Socket) {
    console.log(`Client connecté : ${client.id}`);
    this.connectedUsers[client.id] = client.id; // Ajouter l'utilisateur à la liste des connectés (à remplacer par un ID utilisateur si authentifié)

    // Émettre un événement pour informer tout le monde qu'un utilisateur s'est connecté
    this.server.emit('userConnected', { socketId: client.id, onlineUsers: this.getConnectedUsers() });
  }

  // Lorsqu'un utilisateur se déconnecte
  async handleDisconnect(client: Socket) {
    console.log(`Client déconnecté : ${client.id}`);
    delete this.connectedUsers[client.id]; // Retirer l'utilisateur de la liste des connectés

    // Émettre un événement pour informer tout le monde qu'un utilisateur s'est déconnecté
    this.server.emit('userDisconnected', { socketId: client.id, onlineUsers: this.getConnectedUsers() });
  }

  // Méthode pour obtenir la liste des utilisateurs connectés
  getConnectedUsers() {
    return Object.values(this.connectedUsers); // Retourner tous les socketIds des utilisateurs connectés
  }

  // Méthode publique pour envoyer des événements à tous les clients connectés
  emitToAllUsers(event: string, data: any) {
    this.server.emit(event, data); // Émettre un événement à tous les clients
  }

  // Méthode pour envoyer un message privé à un utilisateur spécifique
  sendMessageToUser(socketId: string, message: string) {
    this.server.to(socketId).emit('privateMessage', { message }); // Émettre un message privé
  }
}
