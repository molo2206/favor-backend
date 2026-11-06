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

# Équipe = Ressources humaines

L'ancienne « équipe média » est retirée : l'équipe d'une séance est choisie parmi les **employés RH actifs** de l'entreprise (`hr_employees` liés à un compte).
- `GET /backoffice/media/availability?startAt=&endAt=&departmentId=` : employés (filtre facultatif : département) libres / occupés ; un employé en **congé approuvé** est indisponible.
- `POST sessions/:id/crew { userId, role }` : refusé si la personne n'est pas un employé RH actif.

---

# Publications du média interne — `/backoffice/media/publications` (connecté)

**Simple :** on enregistre ce qu'on a diffusé, où, et l'admin **saisit à la main** les chiffres (vues, j'aime, commentaires, partages).
Aucun lien avec un site web ni avec une API de réseau social.

> ⚠️ Mise à jour : exécuter `db/sql/logistique_media_mise_a_jour.sql` (ou la migration `1793145600000-LogisticsQuantitiesMediaSimple`).
> Les anciennes tables des réseaux sociaux (`bo_social_*`) et de l'équipe média (`bo_media_team_members`) sont supprimées si elles sont vides (mettre `@force_drop = 1` dans le script pour les supprimer même si elles contiennent des données).

## Une publication
- Titre, description, type (`PHOTO`, `VIDEO`, `AUDIO`, `TEXT`, `DOCUMENT`, `OTHER`), **image de couverture** (multipart `image`), fichiers de la médiathèque (`mediaFileIds`), projet lié (facultatif).
- **Où c'est diffusé** : `channels` en texte libre (`["Facebook", "WhatsApp", "Écran de l'accueil"]`) — `GET channels` propose les libellés déjà utilisés.
- Statut : `DRAFT` → `PUBLISHED` → `ARCHIVED`.

## Les chiffres (saisis par l'admin)
- `POST :id/stats` `{ date?, views, likes, comments, shares, note? }` : l'admin recopie les **compteurs actuels** (ex. 1 250 vues, 80 j'aime).
- Un relevé par jour (ressaisir la même date le remplace) ; une valeur non saisie reprend le relevé précédent.
- Les chiffres affichés sur la publication = dernier relevé ; le **gain du jour** = différence avec le relevé précédent.
- Saisie de plusieurs publications en une fois : `POST stats/bulk` `{ date, lines: [{ publicationId, views, likes, comments, shares }] }`.

## Routes
| Méthode | Route | Rôle |
|---|---|---|
| GET | `dashboard` | Publications par statut, totaux, 7 derniers jours, top 5, publications à mettre à jour (sans chiffres depuis 7 jours) |
| GET | `report?from=&to=&channel=&type=&projectId=&top=` | Gains de la période : totaux, par lieu de diffusion, par type, jour par jour, meilleures publications |
| GET | `channels` | Lieux de diffusion déjà utilisés |
| POST / GET | `` | Créer (+ image) / lister (`status`, `type`, `channel`, `search`, `from`, `to`) |
| GET / PATCH / DELETE | `:id` | Détail (historique des relevés) / modifier (+ image) / supprimer |
| POST | `:id/stats` | Saisir les chiffres |
| POST | `stats/bulk` | Saisie groupée |
| DELETE | `stats/:statId` | Supprimer un relevé erroné |
