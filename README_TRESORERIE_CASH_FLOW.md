# BackOffice — Trésorerie (cash flow)

Préfixe des routes : `/backoffice/finance/cash-flow`. Toutes les routes demandent un token.
`companyId` est facultatif : par défaut, c'est l'entreprise active de l'utilisateur.

**Mise en place :**
- Base de données : `db/sql/tresorerie_cash_flow.sql` (7 nouvelles tables) ou la migration `1795219200000-CashFlow`.
- `.env` : `CASH_FLOW_APPROVAL_THRESHOLD=500`. Au-delà de ce montant (équivalent USD), le mouvement d'un caissier attend une validation. `0` = jamais.

## Qui fait quoi

| Rôle | Droits |
|---|---|
| Propriétaire de l'entreprise, admin plateforme | MANAGER, et gère l'équipe finance |
| MANAGER (responsable financier) | comptes, rubriques, validation, annulation, prévisions, régularisation des écarts |
| CASHIER (caissier) | entrées / sorties, transferts, arrêtés de caisse. Peut être limité à certains comptes |
| VIEWER | lecture et rapports |

`GET /me` renvoie le rôle et `can { read, write, validate, manage }` : le front s'en sert pour afficher ou masquer les boutons.

## Équipe finance
- `GET /members`
- `POST /members` `{ userId, role, accountIds? }`
- `PATCH /members/:id`
- `DELETE /members/:id`

## Comptes (caisse, banque, Mobile Money, F-Pay)

**Routes :**
- `GET /accounts?type=&currency=&branchId=&active=true|false|all&convertTo=USD`
- `POST /accounts` `{ name, type, currency, openingBalance?, openingDate?, branchId?, bankName?, accountNumber?, allowNegative?, minBalance?, isDefault? }`
- `GET /accounts/:id`
- `PATCH /accounts/:id`
- `GET /accounts/:id/ledger?from=&to=` : grand livre, avec le solde après chaque mouvement
- `GET /accounts/:id/expected-balance?date=` : solde théorique, à afficher avant de compter la caisse

**Règles :**
- Un compte = une devise.
- Le solde est calculé : ouverture + entrées validées − sorties validées.
- Une **caisse** ne peut jamais être négative. Une banque peut l'être si `allowNegative` est activé.
- En dessous de `minBalance`, une alerte s'affiche sur le tableau de bord et une notification est envoyée.

## Rubriques

**Routes :**
- `GET /categories?direction=IN|OUT&activity=` : renvoie `data` (liste) et `tree` (rubriques et sous-rubriques)
- `POST /categories` `{ name, direction, activity?, parentId?, code?, color? }`
- `PATCH /categories/:id`

**Fonctionnement :**
- Environ 20 rubriques par défaut sont créées automatiquement : ventes, colis, courses, salaires, loyer, carburant, impôts, équipements, emprunts…
- `activity` range la rubrique dans le tableau des flux : `OPERATING` (exploitation), `INVESTING` (investissement) ou `FINANCING` (financement).

## Mouvements (entrées / sorties)

**Créer :** `POST /transactions` (multipart possible, fichier `attachment` = reçu ou facture)
```json
{ "accountId": "…", "direction": "OUT", "categoryId": "…", "amount": 250, "transactionDate": "2026-11-04",
  "paymentMethod": "CASH", "counterpartyName": "Station Total", "documentNumber": "F-1203", "description": "Carburant camion" }
```
- Saisi par un MANAGER : `VALIDATED` tout de suite.
- Saisi par un CASHIER sous le seuil : `VALIDATED`. Au-dessus du seuil : `PENDING`, et les responsables reçoivent une notification.

**Lire :**
- `GET /transactions?accountId=&categoryId=&direction=&status=&activity=&currency=&from=&to=&search=&transfers=false&page=&limit=`
  - Renvoie aussi `totals` : entrées, sorties et net par devise, pour le filtre appliqué.
- `GET /transactions/export?…` : fichier CSV qui s'ouvre directement dans Excel, avec les mêmes filtres.
- `GET /transactions/:id`

**Modifier et valider :**
- `PATCH /transactions/:id` : un caissier ne modifie que ses mouvements en attente ; un responsable peut modifier tout mouvement non verrouillé.
- `PATCH /transactions/:id/validate`, ou `POST /transactions/validate` `{ ids: [] }` pour en valider plusieurs.
- `PATCH /transactions/:id/reject` `{ reason }`
- `PATCH /transactions/:id/cancel` `{ reason }` : rien n'est supprimé, le mouvement n'est simplement plus compté.

## Transferts entre comptes
- `POST /transfers` `{ fromAccountId, toAccountId, amount, exchangeRate? | receivedAmount?, fees?, transferDate?, description? }`
  - Crée une sortie et une entrée liées. Avec des devises différentes, le taux de la table `exchange_rates` s'applique si on n'envoie ni `exchangeRate` ni `receivedAmount`.
  - Les frais deviennent une vraie dépense (rubrique « Frais de transfert »).
  - Les transferts changent les soldes mais **ne comptent pas** comme entrées / sorties dans les rapports.
- `GET /transfers`
- `PATCH /transfers/:id/validate`

## Prévisions (budget mensuel)
- `GET /forecasts?fromPeriod=2026-01&toPeriod=2026-12`
- `POST /forecasts` `{ lines: [{ categoryId, period: "2026-12", amount, currency }] }` : un montant de 0 supprime la prévision.
- `POST /forecasts/copy` `{ fromPeriod, toPeriods: [...], overwrite? }`

## Arrêtés de caisse
- `POST /closings` `{ accountId, closingDate?, countedBalance? | denominations: [{ value: 20, count: 12 }], adjust?, notes? }`
- `GET /closings?accountId=&from=&to=`

**Fonctionnement :**
- Le serveur compare le solde compté au solde théorique et calcule l'écart.
- `adjust: true` (responsable seulement) crée le mouvement « Écart de caisse ».
- Après un arrêté, les mouvements de ce compte datés de ce jour ou avant sont **verrouillés**.
- L'arrêté est refusé s'il reste des mouvements en attente à cette date.

## Rapports
Tous les montants sont convertis dans `currency` (USD par défaut). Le détail par devise est aussi renvoyé, ainsi que `missingRates` si un taux manque.

- `GET /reports/dashboard?from=&to=&currency=&branchId=` : soldes, entrées, sorties et net, comparaison avec la période précédente, en attente, alertes, principales rubriques, 12 derniers mois, `runwayDays` (nombre de jours couverts par le solde).
- `GET /reports/statement?from=&to=&groupBy=day|week|month|year` : tableau des flux. Solde d'ouverture → exploitation / investissement / financement (entrées et sorties par rubrique) → variation → solde de clôture, avec le détail par période.
- `GET /reports/forecast-vs-actual?year=2026` : prévu, réel, écart et % par rubrique et par mois, `alert` si une dépense dépasse son budget.
- `GET /reports/projection?months=6` : solde prévu mois par mois, à partir des prévisions ou, à défaut, de la moyenne des 3 derniers mois. `shortfallPeriod` = premier mois où le solde prévu devient négatif.
