# Trésorerie : circuit de validation à plusieurs niveaux, avec appels

**Base de données :** exécutez `db/sql/tresorerie_circuit_validation.sql` après `db/sql/tresorerie_cash_flow.sql`. Il crée 3 nouvelles tables. La migration `1795305600000-CashApprovals` fait la même chose.

Toutes les routes ont le préfixe `/backoffice/finance/cash-flow`. `companyId` est facultatif : sans lui, c'est l'entreprise active qui est utilisée.

## 1. Principe (simple pour l'utilisateur)

1. Un caissier saisit une sortie de 1 200 USD.
2. La règle « Dépenses importantes » s'applique : niveau 1 « Responsable financier », puis niveau 2 « Direction générale ».
3. Les validateurs du **niveau 1** sont **appelés** : leur téléphone ou le back-office sonne, et une notification est enregistrée.
4. Dès qu'un validateur ouvre ou décide, la sonnerie s'arrête sur tous ses appareils.
5. Niveau 1 validé : le **niveau 2** est appelé et le demandeur est prévenu de l'avancement.
6. Dernier niveau validé : le mouvement est **validé et compté dans le solde**. Le solde est contrôlé à ce moment.
7. Un refus, à n'importe quel niveau, refuse l'opération. Le demandeur reçoit le motif.
8. Sans réponse, les validateurs sont relancés automatiquement : 3 fois, toutes les 30 minutes par défaut. Ensuite, la demande est **escaladée** aux propriétaires ou aux personnes choisies.

Tant qu'aucune règle n'est créée, rien ne change : le seuil `CASH_FLOW_APPROVAL_THRESHOLD` s'applique, avec 1 niveau « Responsable financier ».

## 2. Règles (écran « Circuit de validation » — responsable financier)

| Action | Route |
|---|---|
| Liste | `GET approval-rules` |
| Modèles prêts | `GET approval-rules/templates`, puis `POST approval-rules/templates` `{ "keys": ["large_expenses","transfers"] }` |
| Créer | `POST approval-rules` |
| Modifier / désactiver | `PATCH approval-rules/:id` (`{ "isActive": false }`) |
| Supprimer | `DELETE approval-rules/:id` |
| Tester | `POST approval-rules/simulate` `{ "scope":"OUT", "amount":1200, "currency":"USD" }` → niveaux et validateurs |

```json
{
  "name": "Dépenses importantes",
  "scope": "OUT",
  "minAmount": 500,
  "maxAmount": null,
  "currency": "USD",
  "categoryIds": [],
  "accountIds": [],
  "applyToManagers": true,
  "allowSelfApproval": false,
  "priority": 0,
  "levels": [
    { "name": "Responsable financier", "approverRoles": ["MANAGER"], "minApprovals": 1, "call": true },
    { "name": "Direction générale", "approverIds": ["<id DG>"], "approverRoles": ["OWNER"], "minApprovals": 1, "call": true,
      "reminderMinutes": 20, "escalateToIds": ["<id PCA>"] }
  ]
}
```

Les champs d'une règle :
- `scope` : `OUT` (sorties), `IN` (entrées), `TRANSFER` (transferts) ou `ALL`.
- Seuils : la règle s'applique de `minAmount` (inclus) à `maxAmount` (exclu). Ils sont exprimés dans `currency` ; les montants dans d'autres devises sont convertis avec `exchange_rates`.
- Choix de la règle : la plus haute `priority` l'emporte, puis le seuil le plus élevé.
- `categoryIds` / `accountIds` : limitent la règle à certaines rubriques ou à certains comptes.
- `applyToManagers` (vrai par défaut) : les responsables financiers passent aussi par le circuit.

Les champs d'un niveau :
- Validateurs : des personnes (`approverIds`) et/ou des rôles (`OWNER` = propriétaires, `MANAGER` = responsables financiers).
- `minApprovals` : nombre de validations nécessaires au niveau. Avec 2, il faut 2 signatures.
- `call` : faire sonner les validateurs.
- `reminderMinutes` : délai avant relance.
- `escalateToIds` : personnes prévenues si le niveau reste sans réponse.

Le demandeur n'approuve jamais sa propre demande. Il est retiré du niveau. Si personne d'autre ne reste, les propriétaires prennent le relais. Avec `allowSelfApproval: true`, un niveau dont il fait partie est validé d'office.

## 3. Demandes (écran « À valider » et suivi)

| Action | Route |
|---|---|
| **À valider par moi** (badge du menu) | `GET approvals/inbox` → `data[]`, `meta.count`, `meta.totals` par devise |
| Tableau de bord | `GET approvals/stats` |
| Liste | `GET approvals?status=PENDING&mine=requested|toApprove|decided&targetType=&from=&to=&search=` |
| Détail | `GET approvals/:id` → niveaux, validateurs (✓), historique, opération (`target`), boutons `can.*` |
| J'ouvre la demande (arrête **ma** sonnerie) | `POST approvals/:id/seen` |
| Valider mon niveau | `POST approvals/:id/approve` `{ "comment": "OK" }` |
| Refuser | `POST approvals/:id/reject` `{ "reason": "Facture manquante" }` |
| Commenter / poser une question | `POST approvals/:id/comment` `{ "comment": "…" }` |
| Rappeler les validateurs (demandeur) | `POST approvals/:id/remind` |
| Retirer la demande (demandeur) | `POST approvals/:id/cancel` `{ "reason": "…" }` |
| Valider d'office (propriétaire / admin) | `POST approvals/:id/force` |
| Valider plusieurs demandes | `POST approvals/bulk-approve` `{ "ids": [...] }` |

Les routes existantes `PATCH transactions/:id/validate`, `PATCH transactions/:id/reject` et `PATCH transfers/:id/validate` suivent maintenant le circuit : elles valident ou refusent le niveau en cours. `GET transactions/:id` renvoie aussi `approval`.

Le front affiche les boutons d'après `can` : `approve`, `reject`, `cancel`, `remind`, `force`.

## 4. Appels et temps réel (WebSocket principal)

| Événement | Destinataires | Usage |
|---|---|---|
| `finance:approval-call` | validateurs du niveau | Écran d'appel dans le back-office : sonnerie pendant `ringSeconds`, boutons **Voir**, **Valider**, **Refuser** |
| `finance:approval-call-cancel` | validateurs | Arrêter la sonnerie (quelqu'un a décidé, ou j'ai ouvert la demande) |
| `finance:approval-updated` | demandeur + validateurs | Rafraîchir les listes et le détail |
| `notification` | concernés | Notification enregistrée (`data.category = "finance"`, `data.approvalId`) |

Push « appel » sur téléphone et navigateur :
- `data.notificationStyle = "call"`, `category = "finance"`, `screen = "cash_approval"`, `approvalId`, `callId = cashapp-<id>-<niveau>`.
- La fin de sonnerie arrive par `notificationStyle = "call_cancel"`.
- Catégorie iOS : `FINANCE_CALL`.

## 5. `.env`

```
CASH_FLOW_CALL=true                    # false = notifications sans sonnerie
CASH_FLOW_CALL_CHANNELS=group,mobile   # applications qui sonnent
CASH_FLOW_CALL_RING_SECONDS=45
CASH_FLOW_REMINDER_MINUTES=30          # relance sans réponse
CASH_FLOW_MAX_REMINDERS=3              # puis escalade
# CASH_FLOW_REMINDERS=false            # couper les relances automatiques
```
