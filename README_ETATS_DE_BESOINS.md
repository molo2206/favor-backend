# BackOffice — États de besoins

Base de données : `db/sql/etats_de_besoins.sql` (7 nouvelles tables, ré-exécutable), ou la migration `1795219200000-NeedsRequests`.
Préfixe des routes : `/backoffice/needs`. `companyId` est facultatif : l'entreprise active de l'utilisateur est prise par défaut.

## Rôles

| Qui | Ce qu'il peut faire |
|---|---|
| Tout utilisateur de l'entreprise (agent) | Créer, modifier un brouillon, soumettre, suivre, annuler, relancer, commenter |
| Validateur | Approuver, rejeter (motif obligatoire), demander une correction, commenter — **seulement à son tour** |
| `FINANCE` (`bo_need_members`) + responsables / caissiers de la Trésorerie | Transmettre, autoriser le décaissement, décaisser, suivre l'exécution |
| `ADMIN` (membre ADMIN, propriétaire, admin plateforme) | Circuits, rôles, remplaçants, tout voir, intervenir hors tour (`override: true`, tracé) |
| `VIEWER` | Lire toutes les demandes et les rapports |

`GET /backoffice/needs/me` renvoie `role`, `isAdmin`, `isFinance`, `toValidate` (badge) et `financeQueue`.

## 1. Agent

```http
POST /backoffice/needs
{
  "title": "Fournitures de bureau T4",
  "description": "Réassort du bureau de Goma",
  "category": "SUPPLIES",
  "priority": "URGENT",
  "justification": "Stock épuisé, besoin pour la clôture trimestrielle",
  "neededBy": "2026-11-20",
  "currency": "USD",
  "items": [
    { "designation": "Rame papier A4", "unit": "rame", "quantity": 20, "unitPrice": 6.5 },
    { "designation": "Cartouche toner", "quantity": 4, "unitPrice": 45 }
  ],
  "submit": false
}
```

- **Département :** il est repris de la fiche employé RH. On peut aussi l'envoyer avec `departmentId`.
- **Catégories :** `MATERIAL`, `SUPPLIES`, `LOGISTICS`, `TRANSPORT`, `MAINTENANCE`, `COMMUNICATION`, `IT`, `SERVICES`, `TRAINING`, `OTHER`.
- **Montant :** le total est calculé automatiquement (quantité × prix unitaire).

Ensuite :
- `PATCH /:id` : modifier. `items` remplace toute la liste. Envoyez `version` (lue sur la fiche) pour éviter d'écraser une modification faite en même temps.
- `POST /:id/attachments` (multipart `files[]` + `kind` : `QUOTE`, `JUSTIFICATION`, `PAYMENT_PROOF`, `EXECUTION_PROOF`, `OTHER`) et `DELETE /:id/attachments/:attachmentId`.
- `POST /:id/submit` `{ "comment"? }`.
- `POST /:id/cancel` `{ "reason" }`, `POST /:id/remind`, `POST /:id/comments` `{ "comment" }`.

## 2. Validation séquentielle

1. À la soumission, **seul le niveau 1** est notifié (notification enregistrée, push, appel qui sonne) et peut décider.
2. Une approbation passe automatiquement la demande au niveau suivant, qui est notifié à son tour. Et ainsi de suite jusqu'au dernier niveau → statut `VALIDATED`.

Routes :
- `GET /backoffice/needs?scope=inbox` : les demandes qui attendent ma décision.
- `POST /:id/approve` `{ "comment"?, "approvedAmount"? }` : `approvedAmount` ne peut pas dépasser le montant demandé.
- `POST /:id/reject` `{ "reason" }` (motif obligatoire).
- `POST /:id/request-correction` `{ "message" }` : la demande revient à l'agent.
- `POST /bulk-approve` `{ "ids": [...], "comment"? }`.

**Hors tour :** un validateur ne peut pas agir avant son tour (erreur « Ce n'est pas encore votre tour »). Seul un ADMIN le peut, en envoyant `override: true`.

**Après une correction**, l'agent modifie la demande puis la resoumet. Elle reprend au niveau qui a demandé la correction, sauf si le montant augmente ou si le circuit change : elle recommence alors au niveau 1.

**Relances :** tâche planifiée toutes les 5 minutes, toutes les `reminderMinutes` (120 par défaut). Après `maxReminders` relances (3 par défaut), la demande est escaladée vers les personnes d'escalade, sinon les remplaçants, sinon la direction.

**Temps réel (socket) :**
- `needs:approval-call` : sonnerie dans le back-office ;
- `needs:approval-call-cancel` : arrêt de la sonnerie ;
- `needs:updated` : la fiche a changé.

## 3. Finance (distincte de la validation)

Après la validation, la demande est transmise automatiquement au service financier (`NEEDS_AUTO_TRANSMIT=true`). Sinon, utilisez `POST /:id/transmit`.

1. **Autoriser :** `POST /:id/authorize` `{ "amount": 150, "note"? }`. Le montant autorisé ne peut pas dépasser le montant approuvé.
2. **Décaisser :** `POST /:id/disbursements` (multipart possible, `files[]` = justificatifs de paiement) :

```json
{ "amount": 100, "paidAt": "2026-11-05", "paidById": "uuid-du-caissier", "beneficiary": "Papeterie du Lac",
  "paymentMethod": "CASH", "paymentReference": "PC-0042", "cashAccountId": "uuid-compte-caisse" }
```

- Le paiement peut être partiel : plusieurs décaissements jusqu'au montant autorisé.
- Avec `cashAccountId`, la sortie de caisse est aussi créée dans la Trésorerie (même devise que la demande). Si elle échoue, le décaissement est annulé.

3. **Exécution :** `PATCH /:id/execution` (multipart possible, `files[]` = preuves) :

```json
{ "items": [{ "itemId": "…", "executedQuantity": 10 }], "note": "Livraison partielle" }
```

Le statut (`IN_PROGRESS`, `PARTIAL`, `COMPLETED`) est déduit des quantités. On peut aussi l'envoyer avec `status`.

**Statuts séparés :**

| Champ | Valeurs |
|---|---|
| `status` | `DRAFT`, `PENDING`, `CORRECTION_REQUESTED`, `REJECTED`, `VALIDATED`, `CANCELLED` |
| `financeStatus` | `NONE`, `TRANSMITTED`, `AUTHORIZED`, `PARTIALLY_PAID`, `PAID` |
| `executionStatus` | `NOT_STARTED`, `IN_PROGRESS`, `PARTIAL`, `COMPLETED` |

## 4. Fiche, progression, historique

`GET /:id` renvoie :
- les articles, les pièces jointes et les décaissements ;
- les niveaux, avec les validateurs, les remplaçants, les décisions et les dates ;
- `steps` : la progression **Agent → Niveau 1 … N → Service financier → Paiement → Exécution**, chaque étape avec un état `DONE`, `CURRENT`, `WAITING`, `REJECTED`, `RETURNED` ou `SKIPPED` ;
- `overdue`, `waitingHours`, `slaHours` ;
- `permissions` : les boutons à afficher (`canApprove`, `canDisburse`…) ;
- `history` : le journal complet. Il n'est jamais modifié et contient les décisions, les modifications avant / après, les notifications et appels envoyés (avec leurs destinataires) et les paiements.

`GET /:id/pdf` produit la fiche PDF (articles, circuit, finance, historique).

## 5. Tableau de bord, liste, exports

Les filtres sont communs à la liste, au tableau de bord et aux exports :

```
scope (mine | inbox | validated_by_me | finance | all), status, financeStatus, executionStatus, priority,
category, departmentId, requesterId, validatorId, from, to (AAAA-MM-JJ), currency, search, overdue=true,
sortBy, sortOrder, page, limit
```

- `GET /backoffice/needs` : liste paginée.
- `GET /backoffice/needs/dashboard` renvoie :
  - les compteurs : total, en attente, approuvées, rejetées, en exécution, exécutées, en retard ;
  - les montants demandés, approuvés, autorisés et décaissés, par devise et en équivalent USD ;
  - les délais moyens de validation, global, par niveau et par validateur ;
  - les répartitions par département, priorité, catégorie et mois.
- `GET /backoffice/needs/export?format=xlsx` (feuilles États de besoins + Articles) ou `format=pdf`.

## 6. Paramètres (administrateur)

- `GET /config/rules` : renvoie les circuits, les modèles et les rôles possibles.
- `POST /config/rules` : crée un circuit. Exemple :

```json
{
  "name": "Circuit standard",
  "departmentIds": [],
  "categories": [],
  "priorities": [],
  "minAmount": 0,
  "maxAmount": null,
  "currency": "USD",
  "slaHours": 48,
  "priority": 0,
  "levels": [
    { "name": "Chef de service", "approverRoles": ["DEPARTMENT_MANAGER"], "substituteIds": ["uuid"], "reminderMinutes": 120 },
    { "name": "Chargé de programme", "approverIds": ["uuid"] },
    { "name": "RAF", "approverRoles": ["FINANCE"] },
    { "name": "Direction générale", "approverRoles": ["OWNER"], "call": true },
    { "name": "Conseil (≥ 20 000 USD)", "approverRoles": ["OWNER"], "minApprovals": 2, "minAmount": 20000 }
  ]
}
```

Règles des circuits :
- Le nombre de niveaux n'est pas limité à 4 (jusqu'à 20).
- **Rôles possibles :** `DEPARTMENT_MANAGER` (chef du département du demandeur), `PARENT_DEPARTMENT_MANAGER`, `FINANCE`, `OWNER`, `NEED_ADMIN`. On peut aussi nommer des personnes avec `approverIds`.
- **Validation supplémentaire selon le montant :** `minAmount` sur un niveau ajoute ce niveau seulement au-delà du seuil. Sur le circuit, `minAmount` / `maxAmount` définissent la plage de montants concernée.
- **Choix du circuit :** le plus prioritaire, puis le seuil le plus haut. Sans circuit : Chef de service → Direction générale.
- Le demandeur n'est jamais validateur de sa propre demande, sauf avec `allowSelfApproval`.

Autres routes :
- `POST /config/rules/template/standard` (ou `small`, `large`), `PATCH` et `DELETE /config/rules/:id`.
- `POST /config/simulate` `{ "amount", "currency"?, "category"?, "priority"?, "departmentId"? }` : aperçu du circuit qui s'appliquerait.
- `GET /config/members`, `POST /config/members` `{ "userId", "role": "ADMIN" | "FINANCE" | "VIEWER" }`, `DELETE /config/members/:userId`.
- `PATCH /config/availability` `{ "from": "2026-11-10", "until": "2026-11-20", "delegateId": "uuid", "userId"? }` : pendant ces dates, les demandes vont au remplaçant, qui est prévenu tout de suite.
- `GET /config/users?search=` : utilisateurs de l'entreprise, pour choisir les validateurs.

## .env (facultatif)

```
NEEDS_REMINDER_MINUTES=120   # relance après 2 h sans réponse
NEEDS_MAX_REMINDERS=3        # puis escalade
NEEDS_SLA_HOURS=48           # délai au-delà duquel une demande est « en retard »
NEEDS_CALL=true              # appels (sonnerie)
NEEDS_CALL_RING_SECONDS=45
NEEDS_CHANNELS=group,mobile,admin
NEEDS_AUTO_TRANSMIT=true     # transmission automatique au service financier après validation
NEEDS_MAX_FILE_MB=15
```
