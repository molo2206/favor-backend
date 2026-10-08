import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  // Désactivation complète de la gestion CORS par Socket.IO
  // (Apache ajoutera les en-têtes nécessaires)
  cors: false,
  transports: ['websocket', 'polling'],
  allowEIO3: true,
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private usersMap = new Map<string, string>();

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      this.usersMap.set(userId, client.id);
      console.log(`✅ User ${userId} connected (socket: ${client.id})`);
    } else {
      console.log(`🔌 Client connected without userId: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = [...this.usersMap.entries()].find(
      ([_, socketId]) => socketId === client.id,
    )?.[0];
    if (userId) {
      this.usersMap.delete(userId);
      console.log(`❌ User ${userId} disconnected`);
    } else {
      console.log(`❌ Client disconnected: ${client.id}`);
    }
  }

  notifyUser(userId: string, event: string, payload: any) {
    const socketId = this.usersMap.get(userId);
    if (socketId) {
      this.server.to(socketId).emit(event, payload);
    } else {
      console.warn(`⚠️ User ${userId} not connected, cannot emit ${event}`);
    }
  }

  broadcastEvent(event: string, payload: any) {
    this.server.emit(event, payload);
  }
}
