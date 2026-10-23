// hooks/use-chat-realtime.ts — branche les événements Socket.IO sur TanStack Query + Zustand
'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { toast } from 'sonner';
import { connectChatSocket, disconnectChatSocket } from '@/lib/chat-socket';
import { registerPushNotifications } from '@/lib/firebase';
import { chatApi } from '@/lib/chat-api';
import type { ChatMessage, Presence } from '@/types/chat';

// ------------------------------------------------------------
// Store : présence + saisie + compteurs
// ------------------------------------------------------------
interface ChatRealtimeState {
  connected: boolean;
  presence: Record<string, Presence>;
  typing: Record<string, Record<string, string>>; // conversationId → userId → fullName
  totalUnread: number;
  notificationsUnread: number;
  activeConversationId: string | null;
  set: (p: Partial<ChatRealtimeState>) => void;
}

export const useChatRealtimeStore = create<ChatRealtimeState>((set) => ({
  connected: false,
  presence: {},
  typing: {},
  totalUnread: 0,
  notificationsUnread: 0,
  activeConversationId: null,
  set: (p) => set(p),
}));

export const useIsOnline = (userId?: string | null) =>
  useChatRealtimeStore((s) => (userId ? !!s.presence[userId]?.isOnline : false));

// ------------------------------------------------------------
// Hook à monter une seule fois (layout du dashboard)
// ------------------------------------------------------------
export function useChatRealtime(opts: { userId: string | null; getToken: () => string | null }) {
  const qc = useQueryClient();
  const set = useChatRealtimeStore((s) => s.set);

  useEffect(() => {
    if (!opts.userId) return;
    const socket = connectChatSocket(opts.getToken);
    void registerPushNotifications().catch(() => undefined);

    const upsertMessage = (conversationId: string, msg: ChatMessage) => {
      qc.setQueryData(['chat', 'messages', conversationId], (old: any) => {
        if (!old) return old;
        const pages = old.pages.map((p: any) => ({ ...p, data: [...p.data] }));
        const last = pages[0];
        const idx = last.data.findIndex(
          (m: ChatMessage) => m.id === msg.id || (msg.clientMessageId && m.clientMessageId === msg.clientMessageId),
        );
        const value = { ...msg, isMine: msg.senderId === opts.userId };
        if (idx >= 0) last.data[idx] = value;
        else last.data.push(value);
        return { ...old, pages };
      });
    };

    socket.on('connect', () => set({ connected: true }));
    socket.on('disconnect', () => set({ connected: false }));

    socket.on('chat:ready', (p: { totalUnread: number; notificationsUnread: number; online: Presence[] }) => {
      const presence: Record<string, Presence> = {};
      p.online.forEach((o) => (presence[o.userId] = o));
      set({ totalUnread: p.totalUnread, notificationsUnread: p.notificationsUnread, presence });
      const active = useChatRealtimeStore.getState().activeConversationId;
      if (active) socket.emit('chat:focus', { conversationId: active });
    });

    socket.on('presence:update', (p: Presence) =>
      set({ presence: { ...useChatRealtimeStore.getState().presence, [p.userId]: p } }),
    );

    socket.on('chat:message:new', ({ conversationId, message }: { conversationId: string; message: ChatMessage }) => {
      upsertMessage(conversationId, message);
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    });
    socket.on('chat:message:updated', ({ conversationId, message }) => upsertMessage(conversationId, message));
    socket.on('chat:message:deleted', ({ conversationId }) =>
      qc.invalidateQueries({ queryKey: ['chat', 'messages', conversationId] }),
    );
    socket.on('chat:message:reaction', ({ conversationId }) =>
      qc.invalidateQueries({ queryKey: ['chat', 'messages', conversationId] }),
    );
    socket.on('chat:read', ({ conversationId }) =>
      qc.invalidateQueries({ queryKey: ['chat', 'messages', conversationId] }),
    );
    socket.on('chat:delivered', ({ conversationId }) =>
      qc.invalidateQueries({ queryKey: ['chat', 'messages', conversationId] }),
    );

    ['chat:conversation:new', 'chat:conversation:updated', 'chat:conversation:removed'].forEach((ev) =>
      socket.on(ev, () => qc.invalidateQueries({ queryKey: ['chat', 'conversations'] })),
    );

    socket.on('chat:unread', (p: { totalUnread: number }) => {
      set({ totalUnread: p.totalUnread });
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    });

    socket.on('chat:typing', (p: { conversationId: string; userId: string; fullName: string; isTyping: boolean }) => {
      const typing = { ...useChatRealtimeStore.getState().typing };
      const conv = { ...(typing[p.conversationId] ?? {}) };
      if (p.isTyping) conv[p.userId] = p.fullName;
      else delete conv[p.userId];
      typing[p.conversationId] = conv;
      set({ typing });
    });

    // Événements EXISTANTS de NotificationsGateway / NotificationsService
    socket.on('notification', (n: { title: string; message: string; type: string; data?: any }) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      if (n.data?.category !== 'chat') return;
      qc.invalidateQueries({ queryKey: ['chat', 'notifications'] });
      if (document.visibilityState === 'visible') toast(n.title, { description: n.message });
    });
    socket.on('notification:count', () => {
      chatApi.notificationsCount().then((r) => set({ notificationsUnread: r.count })).catch(() => undefined);
    });

    // Absent quand l'onglet est masqué longtemps
    let awayTimer: ReturnType<typeof setTimeout> | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        awayTimer = setTimeout(() => socket.emit('presence:set-status', { status: 'AWAY' }), 5 * 60 * 1000);
      } else {
        if (awayTimer) clearTimeout(awayTimer);
        socket.emit('presence:set-status', { status: 'ONLINE' });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (awayTimer) clearTimeout(awayTimer);
      disconnectChatSocket();
      set({ connected: false });
    };
  }, [opts.userId]); // eslint-disable-line react-hooks/exhaustive-deps
}
