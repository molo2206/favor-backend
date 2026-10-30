# Chauffeurs PRIVÉS ou MEMBRES d'une association

Base de données : `db/sql/chauffeurs_associations.sql` ou migration `1793577600000-DriverAssociations.ts`.

## Règle de calcul (à la fin de chaque course)
- Commission plateforme = prix × commission du véhicule (`driver_vehicles.commissionRate`)
- Part association (membre seulement) = prix × `driver_associations.commissionRate`
  → **montant indicatif dû à l'association**, réglé **manuellement** par l'administration :
  il n'est ni prélevé sur le paiement de la course ni déduit du gain du chauffeur.
- Gain du chauffeur = prix − commission plateforme
- L'association et sa part sont figées sur la course au moment de l'acceptation (`rides.associationId`,
  `associationCommissionRate`, `associationCommissionAmount`).
Exemple : course 10 $, véhicule 15 %, association 5 % → plateforme 1,50 $, chauffeur 8,50 $, à verser manuellement à l'association : 0,50 $.

## Routes (admin : ADMIN / SUPER ADMIN)
| Route | Rôle |
|---|---|
| `GET /driver-associations` | liste (`cityId`, `search`, `active`, `page`, `limit`) + nombre de membres |
| `POST /driver-associations` | créer `{ name, code?, cityId?, managerName?, phone?, email?, address?, description?, commissionRate, isActive? }` |
| `GET / PATCH / DELETE /driver-associations/:id` | fiche, modification, suppression (les membres redeviennent privés) |
| `GET /driver-associations/:id/members` | membres + leurs véhicules |
| `GET /driver-associations/:id/stats?from=&to=` | courses, chiffre d'affaires, part association, gains par chauffeur |
| `GET /driver-associations/stats?from=&to=` | toutes les associations + chauffeurs privés |
| `GET /driver-associations/drivers/:driverId` | statut d'un chauffeur |
| `PATCH /driver-associations/drivers/:driverId` | `{ "type": "PRIVATE" }` ou `{ "type": "ASSOCIATION", "associationId": "…", "memberNumber": "A-012" }` |
| `GET /driver-associations/me` | chauffeur connecté : son statut |

Liste admin des véhicules : `GET /driver-vehicles/admin/list?driverType=PRIVATE|ASSOCIATION&associationId=…`
(chaque véhicule renvoie `driverType`, `association`, `memberNumber`).
