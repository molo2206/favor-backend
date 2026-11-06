# Retrait F-Pay depuis Favor Help, confirmé par OTP — 2 étapes

Le client retire l'argent de **son wallet F-Pay** vers son **Mobile Money**. Son compte F-Pay est déjà lié
(`users.userIdFpay`) : **aucun token F-Pay à envoyer**, pas de PIN. F-Pay envoie un **code à 4 chiffres par SMS**.

## Étape 1 — Demande : `POST /fpay/cashout/request`

```json
{ "amount": 5000, "provider": "VODACOM_MPESA_COD", "phone": "243810000000", "walletId": "<id du wallet>" }
```
- `provider` = `name` du réseau F-Pay ; `walletId` facultatif (sinon wallet par défaut).
- Rien n'est débité. Réponse : `requestId`, `amount`, `fee`, `netAmount`, `currency`, `sentTo`, `expiresAt`, `expiresInSeconds`.

## Étape 2 — Validation : `POST /fpay/cashout/confirm`

```json
{ "requestId": "<requestId de l'étape 1>", "otpCode": "1234" }
```
- Retrait exécuté. Réponse : la transaction et le nouveau solde.

En-têtes : `Authorization: Bearer <token Favor>`, `lang: fr`.

## Sécurité

- Seul le wallet du client connecté (`users.userIdFpay`) peut être débité ; un `walletId` d'un autre compte est refusé (403).
- Montant, réseau et numéro figés à la demande ; code valable 10 min, 5 essais, usage unique, stocké haché.
- Clé API FAVOR HELP avec la permission `cashout` (contrôlée en base F-Pay) + OTP envoyé au téléphone du compte F-Pay.
- Retrait classique dans l'app F-Pay : inchangé (PIN).

## Mise en service

1. F-Pay : déployer `api-gateway` et `wallet-service`, exécuter `fpay_permission_cashout_otp.sql` sur la base F-Pay.
2. Favor Help : déployer le backend (aucune modification de la base).
