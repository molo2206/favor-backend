# Chat de course : signalement et blocage (Apple, règle 1.2)

Base de données : `db/sql/chat_signalement_blocage.sql`, ou la migration `1795132800000-RideChatSafety`.
Elle crée 2 nouvelles tables, `ride_chat_reports` et `ride_chat_blocks`, et ne modifie aucune table existante.

## Routes (chauffeur et passager)

| Méthode | Route | Corps / réponse |
|---|---|---|
| POST | `/ride-chat/:rideId/report` | `{ messageId?, reason, details?, block? }` |
| GET | `/ride-chat/blocks` | mes utilisateurs bloqués |
| GET | `/ride-chat/blocks/:userId` | `{ blockedByMe, blockedMe }` |
| POST | `/ride-chat/blocks/:userId` | `{ rideId?, reason? }` : bloquer |
| DELETE | `/ride-chat/blocks/:userId` | débloquer |

Signalement :
- `reason` vaut `HARASSMENT`, `HATE`, `SEXUAL`, `THREAT`, `SPAM`, `SCAM` ou `OTHER`.
- `details` est obligatoire avec `OTHER`.
- Sans `messageId`, c'est l'autre participant de la course qui est signalé.
- `block: true` bloque aussi l'utilisateur signalé.

## Effets du blocage, appliqués par le serveur

- Un envoi de texte ou de vocal vers ou depuis un utilisateur bloqué est refusé avec une erreur **403** :
  - `ride_chat.blocked_by_me` si c'est moi qui ai bloqué ;
  - `ride_chat.blocked_me` si c'est l'autre qui m'a bloqué.
- `GET /ride-chat/:rideId/messages` :
  - ne renvoie plus les messages de l'utilisateur que j'ai bloqué ;
  - ajoute `blockedByMe` et `blockedMe` ;
  - met `canWrite` à `false`.
- `GET /ride-chat/me` ajoute `blockedByMe` et `blockedMe` à chaque conversation. Les non-lus du bloqué ne sont plus comptés.
- L'indicateur « écrit… » n'est plus relayé.
- Socket `ride:chat-block-updated` :
  - `{ userId, blockedByMe }` est envoyé à mes appareils ;
  - `{ userId, blockedMe }` est envoyé à l'utilisateur bloqué.

## Administration

- `GET /ride-chat/admin/reports?status=PENDING&reason=&rideId=&reportedUserId=&page=&limit=`
  - Pour chaque signalement : signaleur, signalé, copie du message, nombre de signalements contre cet utilisateur.
  - `meta.pending` : nombre de signalements en attente.
- `PATCH /ride-chat/admin/reports/:id` avec `{ "status": "ACTION_TAKEN", "adminNote": "…", "hideMessage": true }`
  - `status` vaut `REVIEWED`, `ACTION_TAKEN` ou `DISMISSED`.
  - `hideMessage: true` masque le message signalé aux participants. Il reste visible dans l'historique admin.

Les signalements doivent être traités sous 24 h : c'est l'engagement pris auprès d'Apple.
