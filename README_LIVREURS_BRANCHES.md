# Livreurs par branche — commandes RESTAURANT

Un livreur (rôle `DELIVER`) est rattaché à une ou plusieurs **branches** via ses permissions
(`company_has_user_resource.branchId`) sur la ressource **ORDERS_RESTAURANT** :

| Permission | Effet |
|---|---|
| lecture (`can_read`) | reçoit la notification des nouvelles commandes et voit les commandes de **sa** branche |
| modification ou gestion (`can_update`, `can_manage`) | peut **prendre / traiter** la commande |

Une commande appartient à la branche de la **ville du restaurant**. Le livreur de la branche X ne voit que X.

## Routes (préfixe `/api/v1/delivery`)
| Méthode | Route | Rôle |
|---|---|---|
| GET | `branch/scope` | Mes branches et mes droits |
| GET | `branch/orders?scope=available\|assigned\|all&status=&page=&limit=` | Commandes de ma branche |
| POST | `orders/:orderId/take` | Prendre la commande (le premier la garde) |
| GET | `my-history?status=&from=&to=&page=&limit=` | Historique de mes commandes affectées |
| GET | `my-assignments` | Mes commandes en cours (existant) |

Un livreur qui change le statut d'une commande (`PATCH /orders/:orderId/status`) se la voit affecter automatiquement.

## Appel
La nouvelle commande arrive **comme un appel** chez les livreurs de la branche (écran plein écran + sonnerie, même téléphone verrouillé),
avec le même mécanisme que pour les administrateurs (`OrderCallService`). La sonnerie s'arrête dès qu'un livreur prend la commande,
qu'elle est traitée ou annulée, ou après `ORDER_CALL_RING_SECONDS`. Réglage : `ORDER_CALL_DELIVERERS=true`.

## Temps réel
- `delivery:new-order` : nouvelle commande dans ma branche
- `delivery:order-taken` : la commande a été prise par un autre livreur
- `newDeliveryAssignment` : la commande m'est affectée (existant)

Aucune modification de base de données : la table `order_delivery_assignments` existante est utilisée.

## Affectation par ville (tous les types de commande)

Objectif : une commande de **Goma** n'est confiée qu'à un livreur rattaché à une branche de **Goma** (jamais Beni, Bunia…).

- **Ville de la commande** : ville des entreprises de la commande (sous-commandes), sinon ville de l'adresse de livraison.
- **Branches d'un livreur** : sa branche principale (`user_has_company.branchId`) et les branches de ses permissions actives
  (`company_has_user_resource.branchId`), branches actives seulement.
- `POST /delivery/orders/:orderId/assign` **refuse** un livreur qui n'a aucune branche dans la ville de la commande
  (`delivery_branch.deliverer_wrong_city`). Ville inconnue : pas de restriction. Désactiver : `DELIVERY_ENFORCE_CITY=false`.

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/delivery/orders/:orderId/deliverers?search=&companyId=` | **Personnes à proposer** pour la commande : collaborateurs avec permission sur une branche de la ville + livreurs de la ville, le moins occupé en premier |
| GET | `/company/collaborators/bycompany?branchId=&cityId=&role=DELIVER&search=` | Collaborateurs de l'entreprise active, filtrables |
| GET | `/company/collaborators/company/:companyId?branchId=&cityId=&role=&search=` | Idem pour une entreprise donnée |

Chaque collaborateur renvoie aussi `branches` : `[{ id, name, cityId, cityName, active, isMain }]`.

⚠️ Avant d'activer en production : vérifier les livreurs sans branche (ils ne pourront plus être affectés) :

```sql
SELECT u.id, u.fullName, u.phone FROM users u
 WHERE u.role = 'DELIVER' AND u.isActive = 1
   AND NOT EXISTS (
     SELECT 1 FROM user_has_company uhc
       JOIN branches b ON (b.id = uhc.branchId
                           OR b.id IN (SELECT chur.branchId FROM company_has_user_resource chur
                                        WHERE chur.userCompanyId = uhc.id AND chur.status = 1))
                      AND b.status = 1 AND (b.deleted = 0 OR b.deleted IS NULL) AND b.cityId IS NOT NULL
      WHERE uhc.userId = u.id);
```

## Affectation par PERMISSION sur la branche (pas seulement les livreurs)

Peut être affecté à une commande : **tout collaborateur actif**, quel que soit son rôle, qui a une permission **active**
sur une **branche de la ville de la commande**, pour la ressource de ce type de commande :

| Type de commande | Ressource |
|---|---|
| RESTAURANT | `ORDERS_RESTAURANT` (ou `RESTAURANT.ORDER`) |
| SHOP | `ORDERS_SHOP` (ou `SHOP.ORDER`) |
| CAR / TAXI | `ORDERS_CAR` |
| GROCERY | `ORDERS_MARKET` (ou `GROCERY.ORDER`) |
| autres | `ORDERS_MARKET` |

Les livreurs (rôle `DELIVER`) de la ville restent proposés et acceptés comme avant.

- `GET /delivery/orders/:orderId/deliverers` renvoie pour chaque personne : `role`, `source` (`PERMISSION` ou `DELIVER_ROLE`),
  `branches[].permission` (`canRead`, `canUpdate`, `canManage`, `resources`), `canProcess`, `activeAssignments`, `isCurrent`.
- `POST /delivery/orders/:orderId/assign` refuse une personne sans cette permission dans la ville de la commande
  (`delivery_branch.user_not_assignable`), sauf livreur de la ville.
- `GET /delivery/my-assignments` : un collaborateur (rôle `CUSTOMER` / `DRIVER`) voit aussi les commandes qu'on lui confie
  (`asDeliverer: true`). Le PIN du client ne lui est jamais renvoyé.

Réglages `.env` (facultatifs) :

| Variable | Défaut | Effet |
|---|---|---|
| `DELIVERY_ASSIGN_PERMISSION` | `update` | `update` = modification ou gestion exigée ; `read` = la lecture suffit |
| `DELIVERY_ASSIGN_RESOURCES` | (vide) | ressources ajoutées, ex : `DELIVERY` |
| `DELIVERY_ASSIGN_INCLUDE_DELIVERERS` | `true` | `false` = seulement les personnes avec permission (même les livreurs) |
