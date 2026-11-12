// src/backOffice/chat/services/chat-realtime.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { NotificationsGateway } from 'src/notification/notifications.gateway';

/**
 * Rooms Socket.IO utilisées par le chat, sur le WebSocket principal (NotificationsGateway) :
 *   - room personnelle existante : <userId>   (jointe à l'identification)
 *   - room de conversation       : chat-conv-<conversationId>
 */
export const conversationRoom = (conversationId: string) => `chat-conv-${conversationId}`;

/** Événements émis par le serveur vers les clients */
export const ChatServerEvents = {
  READY: 'chat:ready',
  MESSAGE_NEW: 'chat:message:new',
  MESSAGE_UPDATED: 'chat:message:updated',
  MESSAGE_DELETED: 'chat:message:deleted',
  MESSAGE_REACTION: 'chat:message:reaction',
  MESSAGE_PINNED: 'chat:message:pinned',
  TYPING: 'chat:typing',
  RECORDING: 'chat:recording',
  READ: 'chat:read',
  DELIVERED: 'chat:delivered',
  CONVERSATION_NEW: 'chat:conversation:new',
  CONVERSATION_UPDATED: 'chat:conversation:updated',
  CONVERSATION_REMOVED: 'chat:conversation:removed',
  UNREAD: 'chat:unread',
} as const;

/**
 * Pont entre le chat et le serveur Socket.IO existant (NotificationsGateway.server).
 */
@Injectable()
export class ChatRealtimeService {
  private readonly logger = new Logger(ChatRealtimeService.name);

  constructor(private readonly gateway: NotificationsGateway) {}

  private get server(): Server | null {
    return this.gateway.server ?? null;
  }

  emitToUser(userId: string, event: string, payload: any) {
    this.server?.to(userId).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: any) {
    if (!this.server || !userIds.length) return;
    this.server.to(userIds).emit(event, payload);
  }

  emitToConversation(conversationId: string, event: string, payload: any, exceptUserId?: string) {
    if (!this.server) return;
    const op = this.server.to(conversationRoom(conversationId));
    (exceptUserId ? op.except(exceptUserId) : op).emit(event, payload);
  }

  /** Fait rejoindre la room de conversation à tous les sockets des utilisateurs */
  joinConversation(userIds: string[], conversationId: string) {
    if (!this.server || !userIds.length) return;
    this.server.in(userIds).socketsJoin(conversationRoom(conversationId));
  }

  leaveConversation(userIds: string[], conversationId: string) {
    if (!this.server || !userIds.length) return;
    this.server.in(userIds).socketsLeave(conversationRoom(conversationId));
  }

  /** userIds ayant cette conversation ouverte à l'écran (événement chat:focus) */
  async getViewers(conversationId: string): Promise<Set<string>> {
    const viewers = new Set<string>();
    if (!this.server) return viewers;
    try {
      const sockets = await this.server.in(conversationRoom(conversationId)).fetchSockets();
      for (const s of sockets) {
        if (s.data?.userId && s.data?.activeConversationId === conversationId) {
          viewers.add(s.data.userId);
        }
      }
    } catch (e: any) {
      this.logger.warn(`fetchSockets impossible: ${e.message}`);
    }
    return viewers;
  }
}
