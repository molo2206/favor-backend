import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
  } from '@nestjs/websockets';
  import { Server, Socket } from 'socket.io';
  
  @WebSocketGateway({
    cors: {
      origin: '*',
    },
  })
  export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;
  
    // Map pour stocker les sockets connectés : userId -> socketId
    private usersMap = new Map<string, string>();
  
    handleConnection(client: Socket) {
      const userId = client.handshake.query.userId as string;
      if (userId) {
        this.usersMap.set(userId, client.id);
      }
    }
  
    handleDisconnect(client: Socket) {
      const userId = [...this.usersMap.entries()]
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .find(([_, socketId]) => socketId === client.id)?.[0];
      if (userId) {
        this.usersMap.delete(userId);
      }
    }
  
    // ✅ Émettre un événement à un user spécifique
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    notifyUser(userId: string, event: string, payload: any) {
      const socketId = this.usersMap.get(userId);
      if (socketId) {
        this.server.to(socketId).emit(event, payload);
      }
    }
  
    // ✅ Émettre à tout le monde si besoin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    broadcastEvent(event: string, payload: any) {
      this.server.emit(event, payload);
    }
  }
  