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
**Aucun lien avec les colis.** Statuts : `AVAILABLE`, `IN_USE` (affecté), `IN_REPAIR`, `LOST`, `DISPOSED`.

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/backoffice/logistics/dashboard` | Biens par statut / catégorie / branche, valeur d'achat et valeur actuelle (amortissement), garanties qui expirent, en réparation |
| GET | `/backoffice/logistics/movements` | Historique de tous les biens (filtres) |
| POST / GET | `/backoffice/logistics/categories` | Catégories (code d'inventaire, durée d'amortissement) |
| PATCH / DELETE | `/backoffice/logistics/categories/:id` | Modifier / supprimer (si non utilisée) |
| POST / GET | `/backoffice/logistics/assets` | Enregistrer / lister les biens (code d'inventaire auto : `INF-000001`) |
| GET | `/backoffice/logistics/assets/code/:code` | Scan : code d'inventaire, code-barres ou n° de série |
| GET | `/backoffice/logistics/assets/user/:userId` | Équipements d'un employé |
| GET / PATCH | `/backoffice/logistics/assets/:id` | Fiche + historique / modifier |
| POST | `/backoffice/logistics/assets/:id/assign` · `return` | Remettre à un employé / restitution |
| POST | `/backoffice/logistics/assets/:id/transfer` | Changer de branche / d'emplacement |
| POST | `/backoffice/logistics/assets/:id/repair` | Envoi (`SEND`) / retour (`RETURN`) de réparation, coût |
| POST | `/backoffice/logistics/assets/:id/condition` · `check` | État / contrôle d'inventaire |
| POST | `/backoffice/logistics/assets/:id/lost` · `found` | Perdu / retrouvé |
| POST | `/backoffice/logistics/assets/:id/dispose` | Sortie du patrimoine (vendu, donné, détruit, volé) |

## 5. BackOffice — Charroi : `/backoffice/fleet`

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/backoffice/fleet/dashboard` | Véhicules par statut, missions en cours, documents qui expirent (30 j), entretiens à prévoir, coûts du mois |
| POST / GET | `/backoffice/fleet/vehicles` | Ajouter / lister les véhicules |
| GET / PATCH | `/backoffice/fleet/vehicles/:id` | Fiche complète (historique) / modifier |
| PATCH | `/backoffice/fleet/vehicles/:id/driver` | Affecter / retirer le chauffeur |
| POST | `/backoffice/fleet/vehicles/:id/retire` | Sortir du parc |
| POST / GET | `/backoffice/fleet/missions` | Planifier / lister les missions |
| POST | `/backoffice/fleet/missions/:id/start` · `complete` · `cancel` | Départ, retour (kilométrage), annulation |
| POST / GET / DELETE | `/backoffice/fleet/fuel` | Carburant |
| POST / GET | `/backoffice/fleet/maintenance` | Entretiens / pannes |
| POST | `/backoffice/fleet/maintenance/:id/start` · `complete` · `cancel` | Garage, fin, annulation |
| POST / GET / PATCH / DELETE | `/backoffice/fleet/documents` | Assurance, contrôle technique, carte grise… |

`companyId` est optionnel partout : par défaut, l'entreprise active de l'utilisateur.

## 6. Droits

- Admin / super admin : tout.
- Autres : uniquement les branches / entreprises auxquelles l'utilisateur est rattaché (`user_has_company`).
- Supply : aussi le client de la commande.
