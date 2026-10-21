// types/chat.ts — types partagés du chat back-office (Favor Group)

export type ConversationType = 'DIRECT' | 'GROUP';
export type ParticipantRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'MIXED' | 'SYSTEM';
export type AttachmentType = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'PDF' | 'DOCUMENT' | 'OTHER';
export type PresenceStatus = 'ONLINE' | 'AWAY' | 'BUSY' | 'OFFLINE';
export type MessageStatus = 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface ChatUserLite {
  id: string;
  fullName: string;
  image: string | null;
  email: string | null;
  phone: string | null;
}

export interface Presence {
  userId: string;
  isOnline: boolean;
  status: PresenceStatus;
  lastSeenAt: string | null;
}

export interface ChatAttachment {
  id: string;
  type: AttachmentType;
  url: string;
  thumbnailUrl: string | null;
  originalName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  waveform: number[] | null;
}

export interface ChatReaction {
  emoji: string;
  count: number;
  users: { id: string; fullName: string }[];
  reactedByMe: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  clientMessageId: string | null;
  type: MessageType;
  content: string | null;
  sender: ChatUserLite | null;
  senderId: string | null;
  isMine: boolean;
  status: MessageStatus;
  attachments: ChatAttachment[];
  replyTo: {
    id: string;
    type: MessageType;
    content: string | null;
    isDeleted: boolean;
    sender: { id: string; fullName: string; image: string | null } | null;
    attachment: { type: AttachmentType; thumbnailUrl: string | null; originalName: string } | null;
  } | null;
  forwarded: boolean;
  mentions: string[];
  metadata: Record<string, any> | null;
  reactions: ChatReaction[];
  isEdited: boolean;
  editedAt: string | null;
  isPinned: boolean;
  isDeleted: boolean;
  createdAt: string;
}

export interface ChatMember {
  userId: string;
  role: ParticipantRole;
  joinedAt: string;
  lastReadAt: string | null;
  lastDeliveredAt: string | null;
  user: ChatUserLite | null;
  presence: Presence;
}

export interface ChatConversation {
  id: string;
  type: ConversationType;
  name: string | null;
  description: string | null;
  avatar: string | null;
  onlyAdminsCanWrite: boolean;
  createdById: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  lastMessage: ChatMessage | null;
  peer: (ChatUserLite & { presence: Presence }) | null;
  membersCount: number;
  onlineCount: number;
  members?: ChatMember[];
  me: {
    role: ParticipantRole;
    unreadCount: number;
    isMuted: boolean;
    isArchived: boolean;
    isPinned: boolean;
    lastReadAt: string | null;
    clearedAt: string | null;
    canWrite: boolean;
    hasLeft: boolean;
  };
}

export interface ChatContact {
  userId: string;
  employeeId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  image: string | null;
  position: string | null;
  status: string;
  companyId: string | null;
  branchId: string | null;
  department: { id: string; name: string } | null;
  presence: Presence;
}

/** Notification stockée dans user_notifications (GET /notifications?category=chat) */
export interface ChatNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'chat_message' | 'chat_mention' | 'chat_reply' | 'chat_reaction' | 'chat_group_added' | 'chat_group_removed';
  data: {
    category: 'chat';
    conversationId: string;
    messageId: string | null;
    senderId: string;
    imageUrl: string | null;
    [k: string]: any;
  } | null;
  hasSeen: boolean;
  createdAt: string;
}

export type Ack<T = any> = { success: true; data: T } | { success: false; error: string; status?: number };
