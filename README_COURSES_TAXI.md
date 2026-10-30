# Courses taxi (type Bolt) — WebSocket, Firebase et cycle de course

## 1. Mise en place
1. **Base de données d'abord** : exécuter `db/sql/courses_taxi_temps_reel.sql` en entier
   (ou `npm run migration:run` → `1792708800000-RideRealtimeBolt.ts`). Idempotent, aucune donnée modifiée.
2. `npm run build`, redémarrer l'API.
3. Optionnel `.env` (valeurs par défaut entre parenthèses) :

| Variable | Rôle |
|---|---|
| `RIDE_DISPATCH_RADII_KM` (`3,5,8`) | Rayons de recherche successifs |
| `RIDE_DISPATCH_BATCH` (`5`) | Chauffeurs sollicités par tour |
| `RIDE_OFFER_TIMEOUT_SECONDS` (`20`) | Durée d'un tour |
| `RIDE_DRIVER_STALE_SECONDS` (`180`) | Position trop ancienne = chauffeur ignoré |
| `RIDE_REQUIRE_KYC` (`false`) | N'envoyer qu'aux véhicules KYC `APPROVED` |
| `RIDE_SERVER_PRICING` (`true`) | Prix calculé par le serveur (table `pricings`) |
| `RIDE_UPFRONT_PRICE` (`true`) | Le prix final ne descend pas sous le prix annoncé |
| `RIDE_ONE_ACTIVE_PER_RIDER` (`true`) | Une seule course en cours par passager |
| `RIDE_REDISPATCH_ON_DRIVER_CANCEL` (`true`) | Si le chauffeur annule avant le départ, on cherche un autre chauffeur |
| `RIDE_AVG_SPEED_KMH` (`25`) | Vitesse moyenne pour les temps d'arrivée |
| `RIDE_ANDROID_CHANNEL_ID` | Canal Android des push courses (créé dans l'app) |

## 2. Cycle d'une course
`PENDING → SEARCHING → ACCEPTED → ARRIVED → IN_PROGRESS → COMPLETED` (+ `CANCELLED`).

- **Recherche** : offre aux 5 chauffeurs les plus proches (en ligne, libres, position récente, véhicule actif
  de la bonne catégorie), puis rayon élargi toutes les 20 s. Après le dernier rayon : `ride:no-driver`.
- **Acceptation** : verrou en base, un seul chauffeur gagne ; les autres reçoivent `ride:offer-cancelled`.
- **Chauffeur qui annule avant le départ** : la course repart en recherche (il est exclu).
- **Fin** : prix final (`pricings` : base + km + minutes, minimum), commission, gain chauffeur.
- Chaque étape est enregistrée dans `ride_events` (`GET /rides/:id/events`).

## 3. Canaux (ce qui existait déjà, réutilisé)
- **WebSocket principal `/`** (même connexion et même token que les notifications et le chat).
  Rooms : `<userId>`, `ride-<rideId>`, `drivers`, `drivers-category-<categoryId>`.
- **Notification enregistrée** (`user_notifications`) + événement `notification` (comme avant).
- **Push Firebase** (`FcmService`) : `data = { category: 'ride', rideId, event, type, screen: 'ride' }`.

## 4. Événements Socket.IO

**Client → serveur** (réponse = accusé `{ success, data | error }`)

| Événement | Corps | Qui |
|---|---|---|
| `driver:online` | `{ lat, lng }` | chauffeur |
| `driver:offline` | – | chauffeur |
| `ride:driver-location` | `{ lat, lng, heading?, speed? }` toutes les 3-5 s | chauffeur |
| `ride:accept` | `{ rideId }` | chauffeur |
| `ride:reject` | `{ rideId, reason? }` | chauffeur |
| `ride:arrived` / `ride:start` | `{ rideId }` | chauffeur |
| `ride:complete` | `{ rideId, distance?, duration?, paymentMethod? }` | chauffeur |
| `ride:cancel` | `{ rideId, reason? }` | passager / chauffeur |
| `ride:join` / `ride:leave` | `{ rideId }` | passager / chauffeur |
| `ride:get-state` | – | tous |
| `accept-ride` *(ancien)* | `{ rideId }` | chauffeur — toujours accepté |

**Serveur → client**

| Événement | Destinataire |
|---|---|
| `ride:state` | à la connexion, si une course est en cours |
| `ride:offer` | chauffeur sollicité (offre + distance + `expiresAt`) |
| `ride:offer-cancelled` (+ ancien `ride-cancelled`) | offre prise / annulée / expirée |
| `ride:searching` | passager |
| `ride:accepted` (+ ancien `ride-accepted` pour le chauffeur) | passager + chauffeur (chauffeur, véhicule, note, temps d'arrivée) |
| `ride:driver-location` | room de la course (position, distance restante, temps d'arrivée) |
| `ride:driver-arrived`, `ride:started`, `ride:completed`, `ride:cancelled`, `ride:no-driver`, `ride:updated` | passager / room de la course |
| `ride:error` | auteur d'une action refusée |

## 5. Routes REST
Existantes (inchangées) : `POST /rides`, `GET /rides` (admin), `GET /rides/:id`, `PATCH /rides/:id`,
`DELETE /rides/:id` (admin), `POST /rides/:id/accept`, `POST /rides/:id/cancel`.

Nouvelles : `POST /rides/estimate`, `GET /rides/active`, `GET /rides/me?as=rider|driver`,
`GET /rides/:id/events`, `POST /rides/:id/reject`, `/arrived`, `/start`, `/complete`, `/rate`.

`PATCH /rides/:id` avec `status` passe maintenant par le cycle (mêmes contrôles que les routes dédiées).
`PATCH /driver-location/update` diffuse aussi la position au passager si une course est en cours.
