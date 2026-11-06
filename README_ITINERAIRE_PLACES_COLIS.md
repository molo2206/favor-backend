# Courses : places, itinéraire modifiable, prolongation — Supply : colis et articles pointés

Base de données : exécuter `db/sql/courses_itineraire_places_supply_colis.sql` (ré-exécutable).
Sinon, la migration `1795046400000-RideRouteSeatsSupplyItems` fait la même chose.

`.env` (facultatif) :
- `RIDE_DEFAULT_VEHICLE_SEATS=4` : places des véhicules sans valeur `seats`.
- `RIDE_MAX_ROUTE_CHANGES=10` : nombre de modifications autorisées par course.

---

## 1. Places du véhicule et passagers

**Véhicule.** Le champ `seats` donne le nombre de places passagers, chauffeur non compris. Il est accepté par :
- `POST /driver-vehicles` (chauffeur) ;
- la création par l'admin ;
- `PATCH` chauffeur et `PATCH` admin.

Il est renvoyé dans les listes et dans le détail.

**Course.** On envoie `passengers` (1 par défaut) à `POST /rides/estimate` et à `POST /rides` :

```json
{ "cityId": "…", "categoryId": "…", "pickupLocation": {…}, "dropoffLocation": {…}, "passengers": 5 }
```

Qui reçoit la course :
- Seuls les véhicules avec `seats ≥ passengers` reçoivent l'offre. Si `seats` est vide, la valeur prise est `RIDE_DEFAULT_VEHICLE_SEATS`.
- À l'estimation, `available` tient compte des places.
- À l'acceptation, un véhicule trop petit est refusé avec le message `ride.vehicle_not_enough_seats`.

---

## 2. Modifier l'itinéraire (chauffeur seul, le passager est informé)

Les distances et durées viennent de `/maps/directions` (backend).

### Changer le trajet

Possible aux statuts `ACCEPTED`, `ARRIVED` et `IN_PROGRESS`.

- REST : `POST /rides/:id/route`
- Socket : `ride:change-route` avec `{ rideId, ... }`

```json
{
  "dropoffLocation": { "lat": -4.31, "lng": 15.29, "address": "Gombe" },
  "waypoints": [{ "lat": -4.32, "lng": 15.28, "address": "Station Total" }],
  "distance": 8400,
  "duration": 1260,
  "directionsPolyline": "…",
  "reason": "Route barrée"
}
```

- `distance` et `duration` portent sur tout le nouvel itinéraire : départ → points de passage → destination.
- Prix : le prix initial est gardé. Un supplément s'ajoute si le trajet devient plus long : prix au km × km en plus, et prix à la minute × minutes en plus, avec le même tarif (ville et catégorie).
- Un trajet plus court ne fait jamais baisser le prix.

### Prolonger la course

Possible au statut `IN_PROGRESS`. On ne crée pas de nouvelle course.

- REST : `POST /rides/:id/extend`
- Socket : `ride:extend` avec `{ rideId, ... }`

```json
{ "dropoffLocation": { "lat": -4.30, "lng": 15.31, "address": "Kintambo" }, "distance": 5100, "duration": 780 }
```

- `distance` et `duration` portent seulement sur le trajet ajouté : destination actuelle → nouvelle destination.
- La destination actuelle devient une étape (`stops`), et la nouvelle devient `dropoffLocation`.
- Prix : prix actuel + supplément (km et minutes du trajet ajouté, même tarif).
- La course reste `IN_PROGRESS`. Le chauffeur la termine à la dernière destination avec `ride:complete`.

### Ce que reçoivent le passager et le chauffeur

- Le passager reçoit l'événement socket `ride:route-updated` et une notification push.
- `ride:updated` est aussi envoyé dans la room de la course.
- Contenu de l'événement :
  - le payload habituel de la course ;
  - `passengers`, `originalDropoffLocation`, `originalPrice`, `extraPrice`, `stops`, `waypoints`, `routeChangesCount` ;
  - `routeChange` : la modification qui vient d'être faite ;
  - `directionsPolyline`.

### Historique

`GET /rides/:id/route` (passager, chauffeur ou admin) renvoie :
- l'itinéraire initial (`index 0`, `INITIAL`) ;
- chaque modification (`ROUTE_CHANGED` ou `DESTINATION_ADDED`) avec : date, auteur, position du chauffeur, ancienne et nouvelle destination, km et minutes en plus, supplément, prix avant et après.

Chaque modification est aussi enregistrée dans `ride_events`.

### Paiement

Le front doit payer le `price` ou le `totalToPay` **mis à jour**, celui reçu dans `ride:route-updated`. On peut aussi ne pas envoyer `price` au paiement : c'est alors le prix enregistré qui est payé.

---

## 3. Supply : plusieurs colis, articles pointés

### Articles à pointer

`GET /supply/:id/items` renvoie, pour chaque article :
- `itemId`, produit et variation ;
- `ordered`, `shipped`, `remaining` ;
- les colis où il est déjà parti.

Il renvoie aussi la liste des colis et un résumé (`fullyShipped`).

### Créer un colis

`POST /supply/:id/convert-to-shipment` avec les articles pointés :

```json
{
  "items": [
    { "itemId": "id-ligne-commande-1", "quantity": 2 },
    { "itemId": "id-ligne-commande-2", "quantity": 1 }
  ],
  "originBranchId": "…",
  "destinationBranchId": "…",
  "weight": 3.5
}
```

- Sans `items`, le colis prend tout ce qui reste à expédier. C'est l'ancien fonctionnement.
- Le reste pourra partir dans un autre colis : on rappelle la même route.
- Il est impossible d'envoyer plus que la quantité commandée. Les erreurs possibles sont `supply.item_quantity_exceeded`, `supply.item_not_in_order` et `supply.fully_shipped`.
- Valeur déclarée par défaut :
  - montant du Supply si un seul colis contient toute la commande ;
  - sinon, valeur des articles pointés.
- La réponse contient `parcel` (numéro, nombre d'articles, reste) et l'état des `items`.

### Suivi d'un Supply en plusieurs colis

- `supplies.shipmentId` = le premier colis (rien ne change pour l'existant). Chaque colis porte `supplyId`.
- L'historique suit tous les colis.
- Le Supply passe à `COMPLETED` seulement quand tous les articles sont expédiés **et** que tous les colis sont livrés ou retirés.
- `GET /supply/:id` renvoie aussi `items`, `parcels`, `packing` et les stocks en branche de tous les colis.
