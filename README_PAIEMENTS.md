# Paiements : frais envoyés par le front, commission par véhicule, paiement des courses

## 1. Frais de transaction et devise : envoyés par le front
Comme pour les commandes, c'est l'application qui calcule et envoie `transactionFee`, `appliedFeeRate`
(et `shippingCost` pour les commandes) ainsi que la devise `currency` (USD, CDF, XAF, XOF). Le serveur ne recalcule rien.

| Domaine | Champs envoyés par le front | Montant débité |
|---|---|---|
| Commandes | `transactionFee`, `appliedFeeRate`, `shippingCost`, `currency` (création et `pay-order`) | total + livraison + frais ; `payPendingOrder` enregistre maintenant frais, taux et `grandTotal` |
| Courses | `transactionFee`, `appliedFeeRate`, `currency` à la commande (`POST /rides`), au paiement (`POST /rides/:id/pay`) ou au changement de mode | prix final + frais |
| Annonces | `transactionFee`, `appliedFeeRate`, `currency` au paiement | prix du forfait + frais (Mobile Money et FPay) |

## 2. Commission par véhicule (plus par tarif)
- `driver_vehicles.commissionRate` (15 = 15 %). `pricings.commissionRate` n'est plus utilisée.
- Admin : `GET /driver-vehicles/admin/commissions?driverId=&categoryId=`,
  `PATCH /driver-vehicles/:id/commission` `{ "commissionRate": 15 }` (null = `RIDE_DEFAULT_COMMISSION_RATE`).
- Création admin (`POST /driver-vehicles/admin`) : champ `commissionRate` accepté. Le chauffeur ne peut pas la modifier.
- La commission est figée sur la course à l'acceptation (`rides.commissionRate`), calculée sur le prix (hors frais).
- Reprise : chaque véhicule existant reçoit la commission de l'ancien tarif de sa catégorie.

## 3. Paiement des courses — tous les modes
| Mode | Qui paie / confirme |
|---|---|
| MOBILE_MONEY | passager dans l'app (Pawapay : prix + frais du front), trace FPay |
| FPAY | passager dans l'app (portefeuille, `access_token`) |
| CASH, CARD | remis au chauffeur → il confirme |
| BANK, MANUAL | confirmés par l'admin |

Routes :
- `GET /rides/:id/payment` — prix, frais, total, statut (vérifie le Mobile Money en attente)
- `PATCH /rides/:id/payment-method` `{ paymentMethod, transactionFee?, appliedFeeRate?, currency? }`
- `POST /rides/:id/pay` `{ paymentMethod?, provider?, phone?, access_token?, transactionFee?, appliedFeeRate?, currency? }` — après la fin de course
- `POST /rides/:id/payment/confirm` (chauffeur) `{ paymentMethod?: CASH|CARD, reference? }`
- `POST /rides/:id/payment/admin-confirm` (admin) `{ paymentMethod?, reference? }`

États : `PENDING` → `PROCESSING` (Mobile Money à confirmer, vérifié toutes les 2 min) → `PAID` / `FAILED`.
WebSocket : `ride:payment-updated`. Notifications : `ride_payment` (passager : paiement confirmé / échoué ; chauffeur : course payée + gain).
Les courses terminées avant la mise à jour sont marquées PAYÉES.

## 4. Fichiers
Cloudinary est retiré : tous les envois passent par `FilesService` (stockage du serveur, `BASE_URL/uploads/...`).
Documents des véhicules (carte grise, assurance, permis) : image ou PDF.

## 5. Base de données
`db/sql/paiements_frais_commission_vehicule.sql` ou migration `1793318400000-PaymentFeesVehicleCommission.ts`.

## 6. Moyens de paiement de chaque utilisateur (Mobile Money, FPay, Cash)
Table `user_payment_methods` — script `db/sql/moyens_paiement_utilisateurs.sql` ou migration `1793404800000-UserPaymentMethods.ts`.

| Route | Rôle |
|---|---|
| `GET /users/me/payment-methods` | mes moyens (défaut en premier) + `defaultMethodId` |
| `POST /users/me/payment-methods` | ajouter : `{ type: "MOBILE_MONEY", provider, phone, label?, currency?, isDefault? }`, `{ type: "FPAY", fpayAccount? }`, `{ type: "CASH" }` |
| `PATCH /users/me/payment-methods/:id` | modifier (libellé, opérateur, numéro, compte FPay, devise) |
| `PATCH /users/me/payment-methods/:id/default` | choisir le moyen par défaut |
| `DELETE /users/me/payment-methods/:id` | supprimer (le plus récent devient le défaut) |

Règles : 10 moyens max, pas de doublon (même numéro / même compte / un seul Cash), le premier ajouté devient le défaut.
Le jeton FPay (`access_token`) n'est jamais enregistré : l'application l'envoie au moment du paiement.

Utilisation : champ `paymentMethodId` dans `POST /orders` (création), `pay-order`, `POST /rides`, `POST /rides/:id/pay`,
paiement d'annonce (Mobile Money ou FPay seulement). Le serveur remplit `paymentMethod`, `provider`, `phone`
(et la devise pour les courses si l'app ne l'envoie pas). Ce que l'app envoie explicitement reste prioritaire.
