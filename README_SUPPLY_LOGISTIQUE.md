# Approvisionnement, Supply, logistique interne et charroi

## 1. Mise en place (dans cet ordre)

1. **Base de données d'abord** : exécuter `db/sql/supply_branch_stock_logistique.sql` **en entier**
   (phpMyAdmin → onglet SQL / Importer, ou `mysql -u USER -p BASE < db/sql/supply_branch_stock_logistique.sql`).
   Le script est idempotent : il peut être relancé sans risque.
   Alternative : `npm run migration:run` (migration `1792622400000-SupplyBranchStockLogistics.ts`, même contenu).
2. `npm run build` puis redémarrer l'API.

Aucune donnée existante n'est modifiée. Sur `shipments`, seules 3 colonnes **nullables** sont ajoutées :
`orderId`, `subOrderId`, `supplyId`.

## 2. Stock des branches (pointage) — `/branch-stock`

Stock compté **en pièces** (`package.external_quantity`), retrait partiel possible.
Chaque entrée / sortie crée une ligne dans `branch_parcel_movements` (avant / après, motif, auteur).

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/branch-stock/receive` | Réceptionner un colis dans une branche |
| POST | `/branch-stock/receive-lta` | Réceptionner tous les colis d'une LTA |
| POST | `/branch-stock/withdraw` | Retrait client (sortie) |
| POST | `/branch-stock/:stockId/decrease` | **Diminution manuelle** (motif obligatoire) |
| POST | `/branch-stock/:stockId/adjust` | Inventaire (quantité comptée) |
| PATCH | `/branch-stock/:stockId/location` | Emplacement (étagère, zone…) |
| GET | `/branch-stock/branch/:branchId` | Stock de la branche (recherche, pagination) |
| GET | `/branch-stock/branch/:branchId/summary?from=&to=` | Entrées / sorties / restant |
| GET | `/branch-stock/movements` | Journal de pointage (filtres) |
| GET | `/branch-stock/shipment/:idOuTracking` | Où se trouve un colis |
| GET | `/branch-stock/:stockId` | Détail + mouvements |

**Retrait automatique** : quand le client retire son colis avec le code PIN (`confirmPickupByPin`),
le stock de la branche diminue tout seul (`OUT_PICKUP`). Si le colis n'est pas en stock, rien ne bloque.

## 3. Supply (commande → shipment) — `/supply`

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/supply/from-order/:orderId` | Un Supply par sous-commande (vendeur) |
| POST | `/supply` | Supply pour une commande / sous-commande précise |
| GET | `/supply` | Liste (statut, entreprise, recherche, dates) |
| GET | `/supply/stats` | Compteurs par statut |
| GET | `/supply/order/:orderId/timeline` | Suivi complet d'une commande |
| GET | `/supply/shipment/:idOuTracking` | Supply lié à un colis |
| GET | `/supply/:id` | Détail + stock en branche + historique |
| GET | `/supply/:id/history` | Historique complet |
| POST | `/supply/:id/convert-to-shipment` | **Transformer la commande en shipment** |
| PATCH | `/supply/:id` | Branches, notes |
| PATCH | `/supply/:id/status` | Changer le statut (sens avant uniquement) |
| POST | `/supply/:id/notes` | Ajouter une note |
| POST | `/supply/:id/cancel` | Annuler |

Statuts : `PENDING → PREPARING → READY_TO_SHIP → SHIPMENT_CREATED → IN_TRANSIT → ARRIVED → RECEIVED_AT_BRANCH → COMPLETED` (+ `CANCELLED`).

L'historique (`supply_history`) est alimenté **automatiquement**, sans toucher au code existant :
changement de statut de commande / sous-commande, création du shipment, chaque ligne de tracking,
ajout à une LTA, tracking LTA, réception en branche, mouvements de stock, retrait, transferts.

## 4. BackOffice — Logistique interne : biens de l'entreprise — `/backoffice/logistics`

Patrimoine de l'entreprise (matériel informatique, mobilier, climatiseurs, groupes électrogènes, outillage…).
**Aucun lien avec les colis.** Statuts : `AVAILABLE`, `IN_USE` (tout est chez des employés), `IN_REPAIR`, `LOST`, `DISPOSED`.

> ⚠️ Mise à jour : exécuter `db/sql/logistique_media_mise_a_jour.sql` (ou la migration `1793145600000-LogisticsQuantitiesMediaSimple`).

### Image partout
Chaque création / action accepte une image en **multipart**, champ `image` (ou `photoUrl` si l'image est déjà en ligne) :
catégories, biens, entrées de stock, sorties, restitutions, transferts, réparations, contrôles, pertes, sorties du patrimoine, demandes de matériel.
L'image d'une action est gardée dans l'historique (`movements[].photoUrl`).

### Quantités : entrées et sorties partielles
- Un bien peut être un **lot** : `quantity` = unités dans le patrimoine, `quantityAvailable` = unités en stock, `quantityAssigned` = unités chez les employés, `unit` (pièce, carton, rame…).
- **Entrée** : `POST assets` (nouveau bien / lot) ou `POST assets/:id/stock-in` `{ quantity, unitCost?, supplier?, invoiceNumber? }` (réapprovisionnement).
- **Sortie** : `POST assets/:id/assign` `{ userId, quantity }` → ex. 2 chaises sur 10 (défaut : tout le stock). Chaque sortie crée une **remise** (`bo_asset_assignments`).
- **Restitution** : `POST assets/:id/return` `{ userId | assignmentId, quantity, condition? }`.
- **Sortie groupée** (un employé reçoit plusieurs biens) : `POST assignments/bulk-assign` `{ userId, lines: [{ assetId, quantity }] }` → renvoie le **bon de sortie**.
- **Restitution groupée** : `POST assignments/bulk-return` `{ lines: [{ assignmentId, quantity, condition }] }`.
- Perte / sortie du patrimoine d'une partie d'un lot : `quantity` sur `lost` et `dispose`.

### Demandes de matériel (employé → logisticien → sortie)
1. L'employé demande : `POST requests` `{ reason, priority, neededBy, items: [{ assetId | categoryId | description, quantity }] }` (+ `image`).
2. Le logisticien valide : `PATCH requests/:id/approve` `{ items: [{ itemId, quantityApproved }] }` (lignes non citées = quantité demandée) ou refuse : `PATCH requests/:id/reject` `{ note }`.
3. Il sort le matériel : `POST requests/:id/issue` `{ lines: [{ itemId, assetId, quantity }] }` → remises au nom de l'employé + **bon de sortie**. Sortie en plusieurs fois possible (`PARTIALLY_ISSUED` → `ISSUED`).
4. Notifications (base + WebSocket + push) : nouvelle demande aux logisticiens ; validée / refusée / matériel remis à l'employé.

**Logisticien** = admin plateforme, propriétaire de l'entreprise, ou utilisateur désigné par le propriétaire (`POST managers { userId }`).
Un employé ne voit que ses demandes ; le logisticien les voit toutes.

| Méthode | Route | Rôle |
|---|---|---|
| GET | `dashboard` | Biens par statut / catégorie / branche (unités, en stock), valeurs, ruptures de stock, remises en cours, demandes à traiter |
| GET | `movements` | Historique de tous les biens (filtres) |
| POST / GET | `categories` | Catégories (+ image) |
| PATCH / DELETE | `categories/:id` | Modifier (+ image) / supprimer (si non utilisée) |
| POST / GET | `assets` | Entrée (bien ou lot, + image) / liste (`inStock=true`, `assignedToUserId`…) |
| GET | `assets/code/:code` | Scan : code d'inventaire, code-barres ou n° de série |
| GET | `assets/user/:userId` | Biens et quantités détenus par un employé |
| GET / PATCH | `assets/:id` | Fiche (détenteurs, historique) / modifier (+ image) |
| POST | `assets/:id/stock-in` | Entrée de stock |
| POST | `assets/:id/assign` · `return` | Sortie (quantité) / restitution |
| POST | `assets/:id/transfer` · `repair` · `condition` · `check` | Transfert, réparation, état, inventaire |
| POST | `assets/:id/lost` · `found` · `dispose` | Perte (quantité), retrouvé, sortie du patrimoine (quantité) |
| GET | `assignments` | Remises (filtres : employé, bien, `active=true`) |
| POST | `assignments/bulk-assign` · `bulk-return` | Sortie / restitution groupée |
| GET | `assignments/:id/delivery-note` | Bon de sortie (données à imprimer) |
| GET / POST / DELETE | `managers`, `managers/:id` | Logisticiens désignés (propriétaire) |
| POST / GET | `requests` | Demandes de matériel |
| GET | `requests/:id` | Détail (lignes, sorties) |
| PATCH | `requests/:id/approve` · `reject` · `cancel` | Validation, refus, annulation |
| POST | `requests/:id/issue` | Sortie du matériel accordé |
| GET | `requests/:id/delivery-note` | Bon de sortie de la demande |

> En multipart, les tableaux (`lines`, `items`) s'envoient en texte JSON.

## 5. BackOffice — Charroi = tout le matériel roulant : `/backoffice/fleet`

Types : `CAR`, `PICKUP`, `VAN`, `TRUCK`, `BUS`, `MOTORBIKE`, **`TRICYCLE`**, **`BICYCLE`**, `OTHER`.
- **Immatriculation facultative** pour `BICYCLE`, `TRICYCLE` et `OTHER` ; chaque engin reçoit un **n° interne** (`ENG-0001`, ou celui que vous saisissez).
- Vélo : carburant `NONE` automatiquement ; un plein est refusé.
- **Familles** (onglets) : `family=BICYCLES | MOTORBIKES (motos + tricycles) | VEHICLES (voiture, pick-up, fourgon) | TRUCKS_BUSES | OTHER` ; la liste renvoie aussi le nombre d'engins par famille.
- **Image** (multipart, champ `image`) : engin, mission (création / retour), reçu de carburant, entretien (création / fin), document (image ou PDF).
- Ce module ne concerne pas les véhicules du module Voyage (table `vehicles`).

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/backoffice/fleet/dashboard` | Engins par statut, missions en cours, documents qui expirent (30 j), entretiens à prévoir, coûts du mois |
| POST / GET | `/backoffice/fleet/vehicles` | Ajouter (+ image) / lister (`type`, `family`, recherche plaque / n° interne) |
| GET / PATCH | `/backoffice/fleet/vehicles/:id` | Fiche complète (historique) / modifier (+ image) |
| PATCH | `/backoffice/fleet/vehicles/:id/driver` | Affecter / retirer le conducteur |
| POST | `/backoffice/fleet/vehicles/:id/retire` | Sortir du parc |
| POST / GET | `/backoffice/fleet/missions` | Planifier (+ image) / lister |
| POST | `/backoffice/fleet/missions/:id/start` · `complete` · `cancel` | Départ, retour (kilométrage, + image), annulation |
| POST / GET / DELETE | `/backoffice/fleet/fuel` | Carburant (+ image du reçu) |
| POST / GET | `/backoffice/fleet/maintenance` | Entretiens / pannes (+ image) |
| POST | `/backoffice/fleet/maintenance/:id/start` · `complete` · `cancel` | Garage, fin (+ image), annulation |
| POST / GET / PATCH / DELETE | `/backoffice/fleet/documents` | Assurance, contrôle technique, carte grise… (+ scan image / PDF) |

`companyId` est optionnel partout : par défaut, l'entreprise active de l'utilisateur.

## 6. Droits

- Admin / super admin : tout.
- Autres : uniquement les branches / entreprises auxquelles l'utilisateur est rattaché (`user_has_company`).
- Supply : aussi le client de la commande.
