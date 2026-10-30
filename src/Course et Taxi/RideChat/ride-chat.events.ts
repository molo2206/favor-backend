/**
 * ✅ Événements Socket.IO du chat chauffeur ↔ client (WebSocket principal '/', même token JWT).
 *
 * client → serveur (avec accusé de réception { success, data | error }) :
 *   'ride:chat-send'    { rideId, text, clientMessageId?, replyToId? } → message texte (réponse possible)
 *   'ride:chat-typing'  { rideId, typing?: boolean, recording?: boolean }
 *   'ride:chat-read'    { rideId }                                 → tout marquer comme lu
 *   'ride:chat-history' { rideId, before?, after?, limit? }         → messages (comme GET REST)
 *   (message vocal : REST POST /ride-chat/:rideId/audio — fichier binaire)
 *
 * serveur → client (room personnelle de chaque participant) :
 *   'ride:chat-message'  message complet (texte ou vocal)
 *   'ride:chat-read'     { rideId, readerId, readAt, count }
 *   'ride:chat-typing'   { rideId, userId, role, typing, recording }
 *   'ride:chat-deleted'  { rideId, messageId, deletedBy: 'SENDER' | 'ADMIN', deletedAt }   (supprimé pour tous)
 *   'ride:chat-hidden'   { rideId, messageId }   (supprimé « pour moi » : seulement à celui qui l'a masqué)
 *   'ride:chat-restored' message rétabli par l'administration
 */
export const RideChatSocketEvents = {
  SEND: 'ride:chat-send',
  TYPING: 'ride:chat-typing',
  READ: 'ride:chat-read',
  HISTORY: 'ride:chat-history',
  MESSAGE: 'ride:chat-message',
  DELETED: 'ride:chat-deleted',
  HIDDEN: 'ride:chat-hidden',
  RESTORED: 'ride:chat-restored',
} as const;
