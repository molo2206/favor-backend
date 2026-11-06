// lib/chat-api.ts — appels REST du chat (utilise l'instance Axios existante du back-office)
import { api } from '@/lib/axios'; // ← adapter au chemin de votre instance Axios (interceptors + refresh)
import type { ChatConversation, ChatContact, ChatMessage } from '@/types/chat';

const BASE = '/backoffice/chat';

export const chatApi = {
  contacts: (params?: { search?: string; departmentId?: string; onlineOnly?: boolean; page?: number; limit?: number }) =>
    api.get<{ data: ChatContact[]; meta: any }>(`${BASE}/contacts`, { params }).then((r) => r.data),

  conversations: (params?: { search?: string; archived?: boolean; page?: number; limit?: number }) =>
    api.get<{ data: ChatConversation[]; meta: any }>(`${BASE}/conversations`, { params }).then((r) => r.data),

  conversation: (id: string) => api.get<ChatConversation>(`${BASE}/conversations/${id}`).then((r) => r.data),

  openDirect: (userId: string) =>
    api.post<ChatConversation>(`${BASE}/conversations/direct`, { userId }).then((r) => r.data),

  createGroup: (p: { name: string; description?: string; memberIds: string[]; avatar?: File }) => {
    const fd = new FormData();
    fd.append('name', p.name);
    if (p.description) fd.append('description', p.description);
    fd.append('memberIds', JSON.stringify(p.memberIds));
    if (p.avatar) fd.append('avatar', p.avatar);
    return api.post<ChatConversation>(`${BASE}/conversations/group`, fd).then((r) => r.data);
  },

  messages: (conversationId: string, params?: { before?: string; after?: string; limit?: number }) =>
    api
      .get<{ data: ChatMessage[]; meta: { hasMore: boolean } }>(`${BASE}/conversations/${conversationId}/messages`, { params })
      .then((r) => r.data),

  /**
   * Envoi avec fichiers (images, vidéos, audios, PDF, documents).
   * onProgress : progression d'upload (0-100).
   */
  sendWithFiles: (
    conversationId: string,
    p: { content?: string; files: File[]; replyToId?: string; clientMessageId?: string; durations?: number[]; waveform?: number[] },
    onProgress?: (percent: number) => void,
  ) => {
    const fd = new FormData();
    p.files.forEach((f) => fd.append('files', f));
    if (p.content) fd.append('content', p.content);
    if (p.replyToId) fd.append('replyToId', p.replyToId);
    if (p.clientMessageId) fd.append('clientMessageId', p.clientMessageId);
    if (p.durations?.length) fd.append('durations', JSON.stringify(p.durations));
    if (p.waveform?.length) fd.append('waveform', JSON.stringify(p.waveform));
    return api
      .post<ChatMessage>(`${BASE}/conversations/${conversationId}/messages`, fd, {
        onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded * 100) / e.total)),
      })
      .then((r) => r.data);
  },

  media: (conversationId: string, types?: string) =>
    api.get(`${BASE}/conversations/${conversationId}/media`, { params: { types } }).then((r) => r.data),

  settings: (conversationId: string, p: { isMuted?: boolean; isArchived?: boolean; isPinned?: boolean }) =>
    api.patch<ChatConversation>(`${BASE}/conversations/${conversationId}/settings`, p).then((r) => r.data),

  search: (q: string, conversationId?: string) =>
    api.get<ChatMessage[]>(`${BASE}/messages/search`, { params: { q, conversationId } }).then((r) => r.data),

  unreadCount: () => api.get<{ messages: number; notifications: number }>(`${BASE}/unread-count`).then((r) => r.data),

  // 🔔 Notifications : table existante user_notifications, filtrée sur la catégorie "chat"
  notifications: (params?: { unreadOnly?: boolean; page?: number; limit?: number }) =>
    api.get(`/notifications`, { params: { ...params, category: 'chat' } }).then((r) => r.data.data),
  notificationsCount: () =>
    api.get<{ count: number }>(`/notifications/unread-count`, { params: { category: 'chat' } }).then((r) => r.data),
  readNotification: (id: string) => api.patch(`/notifications/${id}/read`).then((r) => r.data),
  readAllNotifications: () =>
    api.patch(`/notifications/read-all`, null, { params: { category: 'chat' } }).then((r) => r.data),

  // 🔥 Token Firebase : endpoint existant du module users
  registerDeviceToken: (fcmToken: string) =>
    api.post(`/users/device-token`, { fcmToken }, { headers: { 'x-platform': 'web' } }).then((r) => r.data),
};
