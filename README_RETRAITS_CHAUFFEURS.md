# Retrait des gains des chauffeurs via F-Pay

Route F-Pay utilisée : `POST {FPAY_API_URL}/taxi/driver/cashout` — appelée par **`FpayService.taxiDriverCashout()`** (service F-Pay existant, clé `FAVOR_API_TAXI`).
F-Pay débite le wallet du compte **TAXI** et envoie l'argent (payout Pawapay) sur le Mobile Money du chauffeur.

## Installation
1. Exécuter `db/sql/retraits_chauffeurs_fpay.sql` (ou la migration `1794009600000-DriverCashouts`).
2. Remplir dans `.env` : `FAVOR_API_TAXI_PIN`, `FAVOR_API_TAXI_WALLETS` (ou `FAVOR_API_TAXI_DEFAULT_CURRENCY`).
3. Côté F-Pay : la clé API du compte TAXI doit avoir la permission **`cashout`**.
4. `npm run build` puis redémarrer.

## Routes (Favor Driver)
| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/v1/rides/driver/earnings` | Solde retirable par devise |
| POST | `/api/v1/rides/driver/earnings/cashout` | Retrait `{ amount, currency, paymentMethodId? \| provider + phone, requestId? }` + en-tête `Idempotency-Key` |
| GET | `/api/v1/rides/driver/earnings/cashouts` | Historique |
| GET | `/api/v1/rides/driver/earnings/cashouts/:id` | Un retrait |
| GET | `/api/v1/rides/driver/earnings/admin/cashouts?status=UNKNOWN` | Admin : retraits à vérifier |
| PATCH | `/api/v1/rides/driver/earnings/admin/cashouts/:id/resolve` | Admin : `{ status: SUCCESS\|FAILED, fpayReference?, note? }` |

## Statuts
- `PROCESSING` : envoyé à F-Pay.
- `SUCCESS` : F-Pay a confirmé (références F-Pay enregistrées).
- `FAILED` : refus de F-Pay, rien n'est débité, le montant redevient disponible.
- `UNKNOWN` : pas de réponse fiable (délai, coupure) — montant réservé, **jamais renvoyé automatiquement** ; un admin vérifie dans F-Pay puis résout.

## Solde disponible
Gains (`driverEarning`) des courses terminées et payées dans l'application (Mobile Money, FPay, virement, manuel)
− commission des courses en espèces/carte (si `DRIVER_CASHOUT_DEDUCT_CASH_COMMISSION=true`)
− retraits `PROCESSING`, `SUCCESS`, `UNKNOWN`.
