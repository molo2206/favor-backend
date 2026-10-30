# Notifications : appel taxi Firebase + canaux par application (x-platform)

## 1. Demande de course → « appel » sur le téléphone du chauffeur
- Offre de course (`NEW_RIDE`) envoyée en **push data-only, priorité haute** (Firebase) :
  - Android : écran d'appel plein écran, canal `RIDE_CALL_ANDROID_CHANNEL_ID` (défaut `ride_calls`), sonnerie pendant `ringSeconds`.
  - iOS : notification *time-sensitive*, son `ride_ringtone.caf`, catégorie `RIDE_CALL` (boutons Accepter / Refuser).
  - Web : `requireInteraction` + actions Accepter / Refuser.
- Quand l'offre est prise, expirée ou refusée → push `ride_call_cancel` : la sonnerie s'arrête.
- Désactiver : `RIDE_CALL_PUSH=false`.

## 2. Canaux : mobile, web, admin, group
| x-platform envoyé | canal |
|---|---|
| ios, android, mobile | mobile |
| web | web |
| admin | admin (Favor Help) |
| group | group (Favor Group) |

Les applications envoient `x-platform` :
- à la connexion (enregistrement du token Firebase) ;
- sur chaque appel API (liste, compteur non lus, tout lire, tout supprimer filtrés par canal) ;
- au WebSocket : `extraHeaders: { 'x-platform': 'web' }`, ou `auth: { platform: 'web' }`, ou `?platform=web`.

Défauts : offre de course → mobile ; suivi course client → mobile + web ; chat interne → admin + group ;
média → admin + group + mobile ; autres types → toutes les applications.
Réglage sans code : `NOTIFICATION_CHANNELS_<TYPE>=mobile,web` ou `=all`.

Rétro-compatibilité : notifications sans canal (anciennes) et appareils sans plateforme → visibles partout.

## 3. Base de données
`db/sql/notifications_canaux_plateforme.sql` ou migration `1793232000000-NotificationChannels.ts`.

## 4. Nouvelle commande → « appel » Firebase
- Destinataires : propriétaires / utilisateurs de la boutique ou du restaurant (avec permission commandes),
  admins de la ville (`ORDER_CALL_ADMINS=true`), super admins si `ORDER_CALL_SUPER_ADMINS=true`.
- Push data-only priorité haute : `notificationStyle=call`, `callId=order-<orderId>`, `category=order`,
  `orderId`, `invoiceNumber`, `action=NEW_ORDER_FOR_SHOP|NEW_ORDER`, `ringSeconds`.
  - Android : canal `order_calls` (à créer dans l'app, importance max + sonnerie) ;
  - iOS : son `order_ringtone.caf`, catégorie `ORDER_CALL` ;
  - Web : notification persistante.
- La sonnerie s'arrête (push `notificationStyle=call_cancel`, même `callId`) dès que la commande est prise en charge :
  changement de statut, frais de livraison, validation/paiement, annulation — ou après `ORDER_CALL_RING_SECONDS`.
- Utilisateur sans appareil joignable → push classique comme avant. `ORDER_CALL_PUSH=false` → tout comme avant.
- Le client qui commande garde sa notification classique.

## 5. Appel même application fermée (comme WhatsApp)
### Android
Le backend envoie un message Firebase **data-only, priorité haute** (sans bloc `notification`) : c'est ce qui
réveille l'app fermée. L'app doit le traiter dans `setBackgroundMessageHandler` (avant tout `AppRegistry`) et
afficher elle-même l'écran d'appel (Notifee, `fullScreenAction`, canal `ride_calls` / `order_calls`).
Côté backend :
- `RIDE_DRIVER_STALE_SECONDS=900` (avant 180) : un chauffeur « en ligne » dont l'app est fermée reste sollicité ;
- `RIDE_OFFER_TIMEOUT_SECONDS=30` (avant 20) : le temps de réveiller le téléphone ;
- `POST /users/device-token` enregistre maintenant la vraie plateforme (`x-platform` ou `platform` dans le corps) — avant, toujours `unknown`.

Option de secours (téléphones qui bloquent les apps fermées) : `CALL_ANDROID_SYSTEM_NOTIFICATION=true`
ajoute une notification système qui sonne (canal `ride_calls` / `order_calls`, son `res/raw/ride_ringtone` /
`order_ringtone`, priorité max, visible écran verrouillé). Android l'affiche même si l'app ne démarre pas.
L'app doit utiliser le même tag `call-<callId>` pour ne pas afficher deux fois.

### Web (admin, group, site)
Push web priorité haute : notification qui reste affichée jusqu'au clic, vibration, son système, boutons
Accepter / Refuser, clic → `PUSH_WEB_CALL_LINK_ORDER` / `PUSH_WEB_CALL_LINK_RIDE` (`{orderId}`, `{rideId}`).
Reçue onglet fermé tant que le navigateur tourne (service worker `firebase-messaging-sw.js`).
Limite du web : pas de vraie sonnerie continue navigateur fermé (aucun navigateur ne le permet) ; onglet ouvert,
l'app web joue sa sonnerie à la réception de l'événement WebSocket.

### iPhone : écran d'appel natif (CallKit)
Firebase ne transporte pas les push VoIP : le backend les envoie **directement à Apple** (`notification/apns-voip.client.ts`).
1. Apple Developer : créer une clé APNs (.p8) → `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_VOIP_KEY` ou `APNS_VOIP_KEY_PATH`.
2. `APNS_VOIP_TOPIC` = bundle id de l'app + `.voip`, `APNS_PRODUCTION=false` pour les builds de développement.
3. L'app iOS (react-native-voip-push-notification + react-native-callkeep) envoie son jeton :
   `POST /users/device-token` `{ "fcmToken": "...", "voipToken": "...", "platform": "ios" }`.
4. `APNS_VOIP_ENABLED=true`.
Les iPhone qui ont un `voipToken` reçoivent l'appel par Apple ; s'il échoue, repli automatique sur Firebase.
L'arrêt de la sonnerie (`call_cancel`) reste envoyé par Firebase.
⚠️ iOS exige que l'app affiche un appel CallKit à CHAQUE push VoIP reçu ; sinon Apple coupe les push VoIP de l'app.
