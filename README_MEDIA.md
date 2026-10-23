# BackOffice — Média (filmage, photographie, services digitaux)

## Mise en place
1. SQL : `db/sql/supply_branch_stock_logistique.sql` (si pas encore fait : biens de l'entreprise = matériel),
   puis `db/sql/backoffice_media.sql`. Les deux détectent la base tout seuls et peuvent être relancés.
   (Ou `npm run migration:run` → `1792886400000-BackofficeMedia.ts`.)
2. `npm run build`, redémarrer l'API.
3. Optionnel `.env` : `MEDIA_MAX_FILE_MB` (500), `MEDIA_DELIVERY_REQUIRE_PAID` (false = fichiers visibles avant
   paiement du solde), `MEDIA_DELIVERY_BASE_URL` (URL de la page de livraison côté site, sinon l'API).

## Fonctionnement
- **Clients** : externes (payants) et demandes internes (département / entreprise du groupe, total 0 possible).
- **Projet** : `REQUEST → QUOTED → CONFIRMED → IN_PRODUCTION → POST_PRODUCTION → DELIVERED → COMPLETED` (+ `CANCELLED`).
  Devis = lignes reprises du catalogue (prix modifiable), remise, taxe ; paiements (acomptes) → `UNPAID / PARTIAL / PAID`.
- **Planning** : séances (photo, vidéo, drone, live, montage, rendez-vous) avec équipe et matériel.
  Conflits d'horaire bloqués (un membre ou un appareil ne peut pas être sur deux séances en même temps) ;
  matériel en réparation / perdu / sorti refusé. L'équipe reçoit une notification + push Firebase
  (affectation, changement d'horaire, annulation).
- **Matériel** = biens de l'entreprise (`/backoffice/logistics/assets`) : caméras, drones, éclairage…
- **Médiathèque** : fichiers envoyés (qualité préservée) ou liens (Drive, WeTransfer, YouTube).
  `isDeliverable` = livré au client, `isPortfolio` = visible publiquement.
- **Livraison** : lien privé `/media/public/delivery/<token>` (validité en jours).
- Historique complet de chaque projet.

## Routes — `/backoffice/media` (connecté)
| Méthode | Route | Rôle |
|---|---|---|
| GET | `dashboard` | Projets par statut, encaissé du mois, reste à encaisser, top prestations, séances des 7 jours, projets en retard |
| POST / GET / PATCH / DELETE | `services`, `services/:id` | Catalogue des prestations |
| POST / GET / PATCH / DELETE | `team`, `team/:id` | Équipe média (`?role=PHOTOGRAPHER`) |
| POST / GET | `projects` | Créer / lister (filtres : statut, type, paiement, dates, recherche) |
| GET | `projects/mine` | Mes projets (chef de projet ou équipe) |
| GET / PATCH | `projects/:id` | Détail complet (devis, séances, paiements, fichiers, historique) / modifier |
| POST | `projects/:id/items` | Remplacer les lignes du devis |
| PATCH | `projects/:id/status` | Changer le statut (`note` obligatoire pour annuler) |
| POST | `projects/:id/notes` | Note dans l'historique |
| POST / DELETE | `projects/:id/payments`, `projects/:id/payments/:paymentId` | Paiements |
| POST / DELETE | `projects/:id/share` | Créer / désactiver le lien de livraison |
| POST | `projects/:id/sessions` | Planifier une séance (avec `crew` et `assetIds`) |
| GET | `sessions` · `sessions/mine` · `sessions/:id` | Calendrier · mon planning · détail |
| GET | `availability?startAt=&endAt=&assetCategoryId=` | Équipe et matériel libres sur un créneau |
| PATCH / DELETE | `sessions/:id` · `sessions/:id/status` | Modifier (re-vérifie les conflits) / statut / supprimer |
| POST / DELETE | `sessions/:id/crew`, `sessions/:id/crew/:userId` | Équipe de la séance |
| POST / DELETE | `sessions/:id/equipment`, `sessions/:id/equipment/:assetId` | Matériel de la séance |
| POST (multipart) / GET / PATCH / DELETE | `files`, `files/:id` | Médiathèque |

## Routes publiques — `/media/public` (sans connexion)
| GET | Rôle |
|---|---|
| `portfolio/:companyId?tag=&type=` | Réalisations + prestations |
| `services/:companyId` | Catalogue public |
| `delivery/:token` | Galerie de livraison du client |

---

# Réseaux sociaux — `/backoffice/media/social` (connecté)

**But : savoir ce qu'on poste, sur quelles plateformes, et les chiffres jour par jour (j'aime, commentaires, partages, vues…).**

## Mise en place
1. Exécuter `db/sql/backoffice_reseaux_sociaux.sql` **en entier** (après `backoffice_media.sql`) — ou `npm run migration:run` (migration `1792972800000-BackofficeSocialMedia`).
2. Aucune variable d'environnement nouvelle (fuseau : `COMPANY_DEFAULT_TIMEZONE`, défaut Africa/Lubumbashi).

## Fonctionnement
- **Comptes** (`bo_social_accounts`) : chaque page / compte géré (Facebook, Instagram, TikTok, YouTube, LinkedIn, X, WhatsApp, Snapchat, Threads, Pinterest…), de l'entreprise ou d'un client (lien facultatif vers un projet média), avec son community manager et ses abonnés.
- **Publications** (`bo_social_posts`) : titre, texte (légende), hashtags, format (image, carrousel, vidéo, reel, story, live…), visuels de la médiathèque, lien, campagne, date programmée.
  Cycle : `DRAFT → PENDING_APPROVAL → APPROVED → SCHEDULED → PUBLISHED` (ou `CANCELLED`).
  Passage en « à valider » → notification + push aux responsables des comptes ; validation / refus → notification au rédacteur.
  Un contenu modifié après validation repasse en brouillon.
- **Plateformes d'une publication** (`bo_social_post_targets`) : une même publication peut partir sur plusieurs comptes ; pour chacun : statut, date, **lien du post**, budget sponsorisé, et **totaux** (j'aime, commentaires, partages, enregistrements, vues, portée, impressions, clics).
- **Chiffres du jour** (`bo_social_post_daily_stats`) : une ligne par plateforme et par jour.
  - `mode: "DAILY"` (défaut) : on saisit ce qui a été gagné ce jour-là.
  - `mode: "TOTAL"` : on recopie les compteurs affichés par le réseau ; le gain du jour est calculé (total − jours précédents).
  Ressaisir la même date **remplace** la ligne. Les totaux de la plateforme sont recalculés à chaque saisie.
- **Relevé des comptes** (`bo_social_account_daily_stats`) : abonnés en fin de journée (nouveaux abonnés calculés depuis la veille), portée, visites du profil, messages.
- **Interactions** = j'aime + commentaires + partages + enregistrements ; **taux d'engagement** = interactions / portée × 100.

## Routes
| Méthode | Route | Rôle |
|---|---|---|
| GET | `dashboard` | Publications par statut, à valider, programmées 7 jours, chiffres d'aujourd'hui / hier, 7 derniers jours, posts sans chiffres du jour |
| GET | `reports?from=&to=&platform=&accountId=&projectId=&campaign=&top=` | Totaux, comparaison période précédente, par plateforme, par compte (abonnés gagnés), par jour, meilleures publications |
| GET | `calendar?from=&to=&platform=` | Calendrier éditorial (par jour) |
| GET | `stats/missing?date=&days=` | Publications en ligne sans chiffres pour la date |
| POST | `stats/bulk` | Saisie groupée `{ date, mode, lines: [{ targetId, likes, comments, … }] }` |
| POST / GET | `accounts` | Ajouter / lister les comptes (avec totaux) |
| GET / PATCH / DELETE | `accounts/:id` | Détail (30 derniers jours) / modifier / supprimer (désactivé si déjà utilisé) |
| POST / GET | `accounts/:id/stats` | Relevé du jour du compte / historique + interactions par jour |
| POST / GET | `posts` | Créer (avec `accountIds`) / lister (filtres statut, plateforme, compte, campagne, période, recherche) |
| GET / PATCH / DELETE | `posts/:id` | Détail (plateformes, visuels, totaux) / modifier / supprimer (refusé s'il y a des chiffres) |
| PATCH | `posts/:id/status` | Changer de statut `{ status, scheduledAt?, note? }` |
| GET | `posts/:id/stats?from=&to=` | Évolution jour par jour (total et par plateforme) |
| POST | `posts/:id/targets` | Ajouter des plateformes `{ accountIds }` |
| POST | `targets/:targetId/publish` | Marquer publié sur la plateforme `{ postUrl, publishedAt?, externalId? }` |
| PATCH / DELETE | `targets/:targetId` | Modifier (statut, lien, budget sponsorisé) / retirer (si pas encore publié) |
| POST | `targets/:targetId/stats` | Chiffres du jour `{ date?, mode?, likes, comments, shares, saves, views, reach, impressions, clicks }` |
