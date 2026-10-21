# 💬 Chat back-office — branché sur l'infrastructure existante

Le chat entre employés (`src/backOffice/chat/`) **réutilise et enrichit** les briques du projet :

| Brique existante | Utilisation par le chat | Enrichissements apportés |
|---|---|---|
| `NotificationsGateway` (WebSocket `/`, `WsAuthHelper`, room = `userId`) | Même connexion, même token. `ChatGateway` ajoute les événements `chat:*` sur ce socket | Présence temps réel (`PresenceService`, multi-onglets, délai de grâce 5 s), `presence:get`, `presence:set-status`, `presence:update`, hooks `onUserIdentified` / `onUserDisconnected`, `isUserOnline()`, `active-users` sans doublons |
| `FcmService` (Firebase Admin + `device_tokens`) | Push aux destinataires hors ligne | `sendPushToUsers()` (multi-utilisateurs, lots de 500), webpush (lien, icône, tag), canal Android, conversion des `data` en string, **suppression auto des tokens invalides** (aussi dans `sendPushNotification`) |
| `FilesService` (sharp, HEIC, ffmpeg) | Images, vidéos, audios, PDF, documents | Types audio + Excel/PowerPoint/txt/csv/zip, extensions dangereuses bloquées, correction MIME, `uploadFileDetailed()` / `uploadFilesDetailed()` (miniature, dimensions, durée, taille), `deleteFileByUrl()`, `probeMedia()`, dossier `chat` |
| `NotificationsService` + table `user_notifications` | Stockage des notifications du chat (types `chat_*`) | `sendAndSaveNotificationToUsers()`, `emitUnreadCount()` (`notification:count`), `markAsReadByData()`, filtres par type/catégorie, suppression |
| `NotificationsController` | `GET /notifications?category=chat` | Filtres `category`, `type`, `unreadOnly` ; `DELETE /notifications`, `DELETE /notifications/:id` ; compteur et « tout lire » par catégorie |
| `POST /users/device-token` | Enregistrement du token FCM du navigateur | — (inchangé) |

## 1. Mise en place

```bash
npm install
npm run build
npm run migration:run   # bo_chat_* (5 tables) + user_presence
```

Variables `.env` : `BACKOFFICE_WEB_URL`, `CHAT_MAX_FILE_SIZE_MB`, `CHAT_COMPRESS_VIDEO`, `CHAT_EMPLOYEES_ONLY`,
`CHAT_RESTRICT_TO_COMPANY`, `CHAT_EDIT_WINDOW_HOURS`, `CHAT_ANDROID_CHANNEL_ID`, `PUSH_WEB_ICON`, `PUSH_WEB_BADGE`.

Fichiers : `UPLOAD_PATH/chat/AAAA/MM/` → `BASE_URL/uploads/chat/...` (avatars de groupe : `chat/avatars`).
Proxy : autoriser des corps de requête ≥ `CHAT_MAX_FILE_SIZE_MB` (Nginx `client_max_body_size`, Apache `LimitRequestBody`).

## 2. Tables

| Table | Rôle |
|---|---|
| `bo_chat_conversations` | Conversations directes (clé unique `directKey`) et groupes |
| `bo_chat_participants` | Membres, rôle, non lus, lu / distribué, sourdine, archive, épingle |
| `bo_chat_messages` | Texte / médias / système, réponses, transferts, mentions, édition, suppression |
| `bo_chat_attachments` | URL + miniature produites par `FilesService`, taille, dimensions, durée, forme d'onde |
| `bo_chat_reactions` | Réactions emoji |
| `user_presence` | Statut et dernière connexion (utilisé par `NotificationsGateway`, donc par toute l'app) |
| `user_notifications` *(existante)* | Notifications du chat, `type` = `chat_message`, `chat_mention`, `chat_reply`, `chat_reaction`, `chat_group_added`, `chat_group_removed`, `data.conversationId` |

## 3. API REST du chat — `/api/v1/backoffice/chat`

| Méthode | Route | Description |
|---|---|---|
| GET | `/contacts?search=&departmentId=&companyId=&branchId=&onlineOnly=` | Employés + présence |
| GET | `/presence/online` · `/presence/:userId` | Présence |
| PATCH | `/presence/status` | `{ status: ONLINE \| AWAY \| BUSY }` |
| GET | `/conversations` · `/unread-count` | Liste · `{ messages, notifications }` |
| POST | `/conversations/direct` | `{ userId }` |
| POST | `/conversations/group` | multipart `name, description?, memberIds[], onlyAdminsCanWrite?, avatar?` |
| GET / PATCH / DELETE | `/conversations/:id` | Détail / modifier groupe / supprimer pour moi |
| PATCH | `/conversations/:id/settings` | `{ isMuted?, isArchived?, isPinned? }` |
| POST / DELETE / PATCH | `/conversations/:id/members[/:userId[/role]]` | Membres et rôles |
| POST | `/conversations/:id/leave` · `/clear` · `/read` | Quitter · vider · marquer lu |
| GET | `/conversations/:id/media?types=IMAGE,VIDEO,AUDIO,PDF,DOCUMENT` · `/pinned` | Galerie · épinglés |
| GET | `/conversations/:id/messages?before=&after=&limit=` | Messages |
| POST | `/conversations/:id/messages` | **multipart** `files[]` (≤10), `content?`, `replyToId?`, `clientMessageId?`, `mentions?`, `durations?`, `waveform?` |
| GET | `/messages/search?q=` · `/messages/:id` · `/messages/:id/info` | Recherche · message · vu par |
| PATCH / DELETE | `/messages/:id` (`?forEveryone=true`) | Modifier / supprimer |
| POST | `/messages/:id/reactions` · `/pin` · `/forward` | Réaction · épingler · transférer |

Notifications du chat (contrôleur existant) : `GET /notifications?category=chat&unreadOnly=true`,
`GET /notifications/unread-count?category=chat`, `PATCH /notifications/read-all?category=chat`,
`PATCH /notifications/:id/read`, `DELETE /notifications/:id`.

## 4. Socket.IO — connexion principale existante

```ts
const socket = io(API_ORIGIN, { auth: { token: accessToken, platform: 'web' }, transports: ['websocket'] });
// Identification identique aux autres apps : handshake (auth.token / Authorization / query.token)
// ou emit('connection', { token }) pour les anciens clients.
```

Client → serveur (accusé `{ success, data | error }`) : `chat:init`, `chat:send`, `chat:edit`, `chat:delete`,
`chat:react`, `chat:read`, `chat:focus { conversationId | null }`, `chat:typing`, `chat:recording`, `chat:join`,
`presence:get { userIds? }`, `presence:set-status { status }`.

Serveur → client : `chat:ready`, `chat:message:new|updated|deleted|reaction|pinned`, `chat:typing`,
`chat:recording`, `chat:read`, `chat:delivered`, `chat:conversation:new|updated|removed`, `chat:unread`,
et les événements existants enrichis : `notification` (avec `data.category = 'chat'`), `notification:count`,
`presence:update`, `active-users`, `confirmation`.

## 5. Règles des notifications
- Une notification est stockée dans `user_notifications` pour chaque destinataire, sauf s'il a la conversation ouverte (`chat:focus`).
- Sourdine : pas de notification, sauf mention ou réponse.
- Push Firebase (`FcmService.sendPushToUsers`) uniquement si le destinataire est hors ligne.
- Lire une conversation marque ses notifications comme lues (`markAsReadByData`) et met à jour `notification:count`.

## 6. Front Next.js
`docs/backoffice-chat-frontend/` : socket (connexion principale), appels REST, Firebase Messaging + service worker, types, hook React.
