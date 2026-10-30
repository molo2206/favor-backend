# Tableau de bord des courses taxi (admin) + commission des courses en espèces

Toutes les routes sont réservées aux rôles `ADMIN` et `SUPER ADMIN` (jeton requis).
Les montants sont toujours donnés **par devise** (USD, CDF…), jamais additionnés entre devises.
Distances en km, durées en minutes.

## Filtres (communs à toutes les routes de lecture)

| Paramètre | Exemple | Rôle |
|---|---|---|
| `from`, `to` | `2026-10-01` | Période (date de création de la course). Sans période : 30 derniers jours |
| `driverId` | uuid | Un chauffeur |
| `riderId` | uuid | Un passager |
| `cityId`, `categoryId`, `associationId`, `vehicleId` | uuid | Ville, catégorie, association, véhicule |
| `status` | `COMPLETED,CANCELLED` | PENDING, SEARCHING, ACCEPTED, ARRIVED, IN_PROGRESS, COMPLETED, CANCELLED |
| `paymentMethod` | `CASH,MOBILE_MONEY` | CASH, MOBILE_MONEY, FPAY, CARD, BANK, MANUAL |
| `paymentStatus` | `PAID` | PENDING, PROCESSING, PAID, FAILED |
| `currency` | `USD` | Devise |
| `cancelledBy` | `DRIVER` | RIDER, DRIVER, SYSTEM |
| `search` | `Jean` / `0991…` / `A1B2C3D4` | Nom ou téléphone du chauffeur / passager, référence de la course |
| `groupBy` | `day` | Courbe : day, week, month (automatique sinon) |

## Routes

### `GET /admin/rides/dashboard`
Vue d'ensemble :
- `overview` : total, terminées, annulées, en cours, par statut, taux de réussite / d'annulation, chauffeurs et passagers actifs ;
- `revenue[]` (par devise) : montant brut, commission, gains chauffeurs, part des associations, frais de transaction,
  prix moyen, payé / impayé, encaissé par les chauffeurs (espèces, carte) / dans l'application ;
- `paymentMethods[]`, `cancellations` (RIDER / DRIVER / SYSTEM) ;
- `commissions[]` : **toutes les commissions par devise**, avec `byPaymentMethod[]` (une ligne par moyen de paiement) :
  courses, montant brut, commission, % moyen, part des associations, frais de transaction, gains chauffeurs,
  `commissionCollected` (courses payées — espèces : dès que le chauffeur a confirmé), `commissionPending`
  (courses terminées pas encore payées / confirmées), `collectedBy` (APP / DRIVER),
  `debitedFromDrivers` et `creditedToTaxi` (espèces : commission débitée des gains / créditée au compte F-Pay TAXI) ;
- `performance` : distance et durée moyennes, temps d'acceptation, temps d'arrivée au passager, durée du trajet, notes ;
- `timeline[]` : `{ period, total, completed, cancelled, revenue: { USD: { gross, commission } } }`, sans trou ;
- `topDrivers[]` (10), `cities[]`, `categories[]` ;
- `live` : courses en cours maintenant (hors période) ;
- `cashCommissions[]` : commissions espèces débitées / créditées au compte TAXI / en échec.

### `GET /admin/rides`
Liste paginée : mêmes filtres + `page`, `limit` (max 200), `sortBy` (createdAt, price, distance, completedAt), `sortDir` (ASC, DESC).
Chaque course : référence, statut, dates, départ / arrivée, montants, paiement, chauffeur, passager, ville, catégorie.

### `GET /admin/rides/drivers?search=`
Chauffeurs pour le sélecteur du filtre (nom, téléphone, nombre de courses, dernière course).

### `GET /admin/rides/cash-commissions`
Commissions des courses en espèces : `from`, `to`, `driverId`, `currency`, `taxiCreditStatus` (PENDING, SUCCESS, FAILED, DISABLED), `page`, `limit`.

### `POST /admin/rides/cash-commissions/:id/retry`
Relance le crédit du compte F-Pay TAXI d'une commission en échec.
⚠️ Vérifier d'abord dans F-Pay que la commission n'a pas déjà été créditée (réponse perdue).

## Course payée en espèces

Quand le chauffeur valide « espèces reçues » (`POST /rides/:id/payment/confirm`) :
1. **chauffeur avec compte F-Pay lié** (`users.userIdFpay`) : la commission est **prélevée sur son wallet F-Pay**
   et **créditée au compte F-Pay TAXI**, en une seule opération F-Pay (route `taxi/driver/commission`).
   Solde F-Pay insuffisant → son solde F-Pay devient **négatif (dette)**, remboursée par ses prochains crédits F-Pay ;
2. **chauffeur sans compte F-Pay** : la commission est débitée de ses gains Favor Help (dette possible)
   et le compte F-Pay TAXI est crédité ;
3. le chauffeur reçoit une notification.

Une seule fois par course (contrôlé dans Favor Help ET dans F-Pay). Si F-Pay ne répond pas, la validation du chauffeur
réussit quand même et l'opération reste en `FAILED` (relançable par un admin, sans risque de double prélèvement en mode F-Pay).
Les anciennes courses en espèces ne sont pas débitées.

Réglages `.env` :

| Réglage | Défaut | Rôle |
|---|---|---|
| `RIDE_CASH_COMMISSION_DEBIT` | `true` | `false` = désactivé (fonctionnement d'avant) |
| `RIDE_CASH_COMMISSION_METHODS` | `CASH` | Modes concernés (ex. `CASH,CARD`) |
| `RIDE_CASH_COMMISSION_SOURCE` | `FPAY` | `FPAY` = wallet F-Pay du chauffeur ; `GAINS` = gains Favor Help |
| `RIDE_CASH_COMMISSION_FPAY_CREDIT` | `true` | Mode gains : `false` = débit des gains seulement, sans crédit F-Pay TAXI |

F-Pay : la clé `FAVOR_API_TAXI` doit avoir la permission `taxi_commission`.

Base de données : `db/sql/courses_taxi_dashboard_commission_especes.sql` (ou la migration `1794614400000-DriverWalletMovements`).
