// src/events/events.gateway.ts
import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
  } from '@nestjs/websockets';
  import { Server, Socket } from 'socket.io';
  import { Logger } from '@nestjs/common';
  
  @WebSocketGateway({
    cors: {
      origin: '*',
    },
  })
  export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;
  
    private logger: Logger = new Logger('EventsGateway');
  
    handleConnection(client: Socket) {
      this.logger.log(`Client connected: ${client.id}`);
    }
  
    handleDisconnect(client: Socket) {
      this.logger.log(`Client disconnected: ${client.id}`);
    }
  
    @SubscribeMessage('ping')
    handlePing(@MessageBody() data: string, @ConnectedSocket() client: Socket) {
      this.logger.log(`Received ping: ${data}`);
      client.emit('pong', `pong: ${data}`);
    }
  
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    broadcastEvent(event: string, payload: any) {
      this.server.emit(event, payload);
    }
  }
  