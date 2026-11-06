// src/backOffice/chat/chat.gateway.ts
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Socket } from 'socket.io';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NotificationsGateway } from 'src/notification/notifications.gateway';
import { WsAuthHelper } from 'src/notification/utils/ws-auth.helper';
import { ChatService, ChatActor } from './services/chat.service';
import {
  ChatRealtimeService,
  ChatServerEvents,
  conversationRoom,
} from './services/chat-realtime.service';
import { EditMessageDto, SocketSendMessageDto } from './dto/chat.dto';

type Ack<T = any> = { success: true; data: T } | { success: false; error: string; status?: number };

/**
 * Événements Socket.IO du chat back-office, sur le WebSocket PRINCIPAL ('/')
 * déjà utilisé par NotificationsGateway (même connexion, même token).
 *
 * L'identification reste celle de NotificationsGateway (handshake JWT ou événement
 * 'connection') : ce gateway lit socket.data.userId posé par finalizeIdentification().
 */
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
export class ChatGateway implements OnModuleInit {
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly notificationsGateway: NotificationsGateway,
    private readonly wsAuthHelper: WsAuthHelper,
    private readonly chatService: ChatService,
    private readonly realtime: ChatRealtimeService,
  ) {}

  /** Branche le chat sur l'identification / déconnexion du gateway existant */
  onModuleInit() {
    this.notificationsGateway.onUserIdentified(async (socket, user) => {
      await this.prepareSocket(socket, user.userId);
    });

    this.notificationsGateway.onUserDisconnected((socket, userId) => {
      const active = socket.data?.activeConversationId;
      if (active) {
        this.realtime.emitToConversation(
          active,
          ChatServerEvents.TYPING,
          { conversationId: active, userId, fullName: socket.data?.fullName, isTyping: false },
          userId,
        );
      }
    });

    this.logger.log('✅ Chat back-office branché sur NotificationsGateway');
  }

  /** Rejoint les rooms de conversation, marque "distribué" et envoie l'état initial */
  private async prepareSocket(socket: Socket, userId: string) {
    const conversationIds = await this.chatService.getConversationIdsOf(userId);
    if (conversationIds.length) socket.join(conversationIds.map(conversationRoom));
    socket.data.activeConversationId = null;

    await this.chatService.markAllDelivered(userId);
    const state = await this.chatService.getInitialState(userId);
    socket.emit(ChatServerEvents.READY, { ...state, socketId: socket.id });
  }

  // ============================================================
  // Synchronisation (client qui veut recharger l'état du chat)
  // ============================================================
  @SubscribeMessage('chat:init')
  async onInit(@ConnectedSocket() socket: Socket): Promise<Ack> {
    return this.run(socket, async (actor) => {
      await this.prepareSocket(socket, actor.id);
      return this.chatService.getInitialState(actor.id);
    });
  }

  // ============================================================
  // Messages
  // ============================================================
  @SubscribeMessage('chat:send')
  async onSend(@ConnectedSocket() socket: Socket, @MessageBody() body: any): Promise<Ack> {
    return this.run(socket, async (actor) => {
      const dto = await this.validateDto(SocketSendMessageDto, body);
      const { conversationId, ...rest } = dto;
      return this.chatService.sendMessage(actor, conversationId, rest);
    });
  }

  @SubscribeMessage('chat:edit')
  async onEdit(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { messageId: string; content: string },
  ): Promise<Ack> {
    return this.run(socket, async (actor) => {
      const dto = await this.validateDto(EditMessageDto, { content: body?.content });
      return this.chatService.editMessage(actor, body.messageId, dto);
    });
  }

  @SubscribeMessage('chat:delete')
  async onDelete(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { messageId: string; forEveryone?: boolean },
  ): Promise<Ack> {
    return this.run(socket, (actor) =>
      this.chatService.deleteMessage(actor, body?.messageId, !!body?.forEveryone),
    );
  }

  @SubscribeMessage('chat:react')
  async onReact(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { messageId: string; emoji: string },
  ): Promise<Ack> {
    return this.run(socket, (actor) => {
      if (!body?.emoji || String(body.emoji).length > 32) throw new Error('Emoji invalide');
      return this.chatService.toggleReaction(actor, body.messageId, String(body.emoji));
    });
  }

  // ============================================================
  // Lecture / focus / saisie
  // ============================================================
  @SubscribeMessage('chat:read')
  async onRead(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId: string; messageId?: string },
  ): Promise<Ack> {
    return this.run(socket, (actor) =>
      this.chatService.markRead(actor, body?.conversationId, body?.messageId),
    );
  }

  /** Conversation ouverte à l'écran (null = aucune) : marque lu et coupe les notifications */
  @SubscribeMessage('chat:focus')
  async onFocus(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId?: string | null },
  ): Promise<Ack> {
    return this.run(socket, async (actor) => {
      const conversationId = body?.conversationId || null;
      if (conversationId && !socket.rooms.has(conversationRoom(conversationId))) {
        await this.chatService.assertParticipant(actor.id, conversationId, true);
        socket.join(conversationRoom(conversationId));
      }
      socket.data.activeConversationId = conversationId;
      if (conversationId) return this.chatService.markRead(actor, conversationId);
      return { conversationId: null };
    });
  }

  @SubscribeMessage('chat:typing')
  onTyping(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId: string; isTyping: boolean },
  ) {
    const userId = this.wsAuthHelper.extractUserId(socket);
    const conversationId = body?.conversationId;
    if (!userId || !conversationId || !socket.rooms.has(conversationRoom(conversationId))) return;
    this.realtime.emitToConversation(
      conversationId,
      ChatServerEvents.TYPING,
      { conversationId, userId, fullName: socket.data.fullName, isTyping: !!body.isTyping },
      userId,
    );
  }

  /** Enregistrement d'une note vocale en cours */
  @SubscribeMessage('chat:recording')
  onRecording(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId: string; isRecording: boolean },
  ) {
    const userId = this.wsAuthHelper.extractUserId(socket);
    const conversationId = body?.conversationId;
    if (!userId || !conversationId || !socket.rooms.has(conversationRoom(conversationId))) return;
    this.realtime.emitToConversation(
      conversationId,
      ChatServerEvents.RECORDING,
      { conversationId, userId, fullName: socket.data.fullName, isRecording: !!body.isRecording },
      userId,
    );
  }

  @SubscribeMessage('chat:join')
  async onJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId: string },
  ): Promise<Ack> {
    return this.run(socket, async (actor) => {
      await this.chatService.assertParticipant(actor.id, body?.conversationId);
      socket.join(conversationRoom(body.conversationId));
      return { conversationId: body.conversationId };
    });
  }

  // ============================================================
  // Helpers
  // ============================================================
  private actor(socket: Socket): ChatActor | null {
    const userId = this.wsAuthHelper.extractUserId(socket);
    if (!userId) return null;
    return {
      id: userId,
      fullName: socket.data.fullName,
      role: socket.data.role,
    };
  }

  private async run<T>(socket: Socket, fn: (actor: ChatActor) => Promise<T> | T): Promise<Ack<T>> {
    const actor = this.actor(socket);
    if (!actor) {
      return { success: false, status: 401, error: "Socket non identifié : envoyez d'abord 'connection' avec le token" };
    }
    try {
      const data = await fn(actor);
      return { success: true, data };
    } catch (e: any) {
      const status = typeof e?.getStatus === 'function' ? e.getStatus() : undefined;
      const response = typeof e?.getResponse === 'function' ? e.getResponse() : undefined;
      const message =
        (response && typeof response === 'object' && (response as any).message) ||
        e?.message ||
        'Erreur inconnue';
      if (!status || status >= 500) this.logger.error(`Chat WS: ${e?.message}`, e?.stack);
      return {
        success: false,
        status,
        error: Array.isArray(message) ? message.join(', ') : String(message),
      };
    }
  }

  private async validateDto<T extends object>(cls: new () => T, body: any): Promise<T> {
    const plain: Record<string, unknown> =
      body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const instance = plainToInstance(cls, plain);
    const errors = await validate(instance as object, { whitelist: true });
    if (errors.length) {
      const msg = errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .filter(Boolean)
        .join(' | ');
      throw new Error(msg || 'Données invalides');
    }
    return instance;
  }
}
