// lib/chat-socket.ts — connexion au WebSocket PRINCIPAL du backend (NotificationsGateway)
// Le chat, les notifications et la présence passent tous par cette même connexion.
// Si le back-office a déjà un socket vers l'API, réutilisez-le à la place de connectChatSocket().
// npm i socket.io-client
'use client';

import { io, Socket } from 'socket.io-client';
import type { Ack } from '@/types/chat';

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'https://api-prod.favorhelp.com/api/v1')
  .replace(/\/api\/v1\/?$/, '');

let socket: Socket | null = null;

/**
 * Connexion unique (singleton). Appeler après login avec le token d'accès.
 * getToken est rappelé à chaque reconnexion pour utiliser un token rafraîchi.
 */
export function connectChatSocket(getToken: () => string | null | Promise<string | null>): Socket {
  if (socket) return socket;

  socket = io(API_ORIGIN, {
    transports: ['websocket', 'polling'],
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    auth: async (cb) => cb({ token: await getToken(), platform: 'web' }),
  });

  socket.on('connect_error', (err) => {
    console.warn('[socket] connect_error:', err.message);
  });
  // Token invalide/expiré au handshake : le gateway émet 'connection-error'.
  // On se reconnecte après le refresh du token (auth() est rappelé).
  socket.on('connection-error', () => {
    setTimeout(() => socket?.disconnect().connect(), 3000);
  });

  socket.connect();
  return socket;
}

export function getChatSocket(): Socket | null {
  return socket;
}

export function disconnectChatSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

/** emit avec accusé typé + timeout */
export function emitWithAck<T = any>(event: string, payload?: any, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Chat déconnecté'));
    socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: Ack<T>) => {
      if (err) return reject(new Error('Délai dépassé'));
      if (!res?.success) return reject(new Error((res as any)?.error ?? 'Erreur'));
      resolve(res.data);
    });
  });
}

// Raccourcis
export const chatSocketApi = {
  send: (p: { conversationId: string; content: string; replyToId?: string; clientMessageId?: string; mentions?: string[] }) =>
    emitWithAck('chat:send', p),
  edit: (messageId: string, content: string) => emitWithAck('chat:edit', { messageId, content }),
  remove: (messageId: string, forEveryone = false) => emitWithAck('chat:delete', { messageId, forEveryone }),
  react: (messageId: string, emoji: string) => emitWithAck('chat:react', { messageId, emoji }),
  read: (conversationId: string, messageId?: string) => emitWithAck('chat:read', { conversationId, messageId }),
  focus: (conversationId: string | null) => emitWithAck('chat:focus', { conversationId }),
  typing: (conversationId: string, isTyping: boolean) => socket?.emit('chat:typing', { conversationId, isTyping }),
  recording: (conversationId: string, isRecording: boolean) =>
    socket?.emit('chat:recording', { conversationId, isRecording }),
  init: () => emitWithAck('chat:init'),
  setStatus: (status: 'ONLINE' | 'AWAY' | 'BUSY') => emitWithAck('presence:set-status', { status }),
  presence: (userIds?: string[]) => emitWithAck('presence:get', { userIds }),
};
