# Disponibilité des produits d'une commande (version simple)

La structure existante ne change pas. Il n'y a aucun nouveau blocage des statuts ni de la livraison.

## Fonctionnement
1. **Commande** : quand le client commande, chaque produit (`order_items`) est créé avec `availabilityStatus = PENDING`.
2. **Appel du propriétaire** : il reçoit la notification et l'appel **déjà existants** (`action = NEW_ORDER_FOR_SHOP`). Un champ est ajouté : `confirmAvailability = true`.
3. **Consultation** : il ouvre la commande avec `GET /orders/availability/:orderId`. Il ne voit que **ses** produits.
4. **Réponse** : il choisit « Disponible » ou « Indisponible » avec `PATCH /orders/availability/:orderId`.
5. **Plusieurs boutiques** : chacune répond pour ses propres produits.
6. **Résultat** : quand tous les produits ont une réponse, **seuls les administrateurs** sont prévenus (le client ne reçoit rien) :
   - `AVAILABLE` : tout est disponible ;
   - `PARTIAL` : une partie est disponible, avec la liste des produits manquants et le montant des produits disponibles ;
   - `UNAVAILABLE` : rien n'est disponible.

## Statuts d'un produit (`order_items.availabilityStatus`)
- `PENDING` : en attente
- `AVAILABLE` : disponible
- `UNAVAILABLE` : indisponible
- `NULL` : ancienne commande

## API
| Méthode | Route | Rôle |
|---|---|---|
| GET | `/orders/availability/pending?page=1&limit=20` | Mes commandes qui attendent une réponse |
| GET | `/orders/availability/:orderId` | Mes produits de la commande + `canConfirm` + résumé `availability` |
| PATCH | `/orders/availability/:orderId` | `{ "status": "AVAILABLE" }`, ou `{ "items": [{ "orderItemId": "…", "status": "UNAVAILABLE", "note": "…" }] }` |

Qui peut répondre :
- Le propriétaire de la boutique, ou un employé avec une permission « commandes » : pour ses produits seulement.
- Un super admin, ou un admin qui gère ce type de commande : pour toutes les boutiques.

Une réponse peut être corrigée tant que la commande est `PENDING` ou `VALIDATED`.

## Base de données
Lancer `db/sql/disponibilite_produits_commandes.sql` sur `favor_db`. Le script ajoute 4 colonnes `NULL` sur `order_items` et ne touche à rien d'autre.

## .env (facultatif)
`ORDER_AVAILABILITY_CHECK=false` désactive la fonctionnalité.
