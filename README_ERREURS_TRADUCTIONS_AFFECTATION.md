# Erreurs, traductions et affectation utilisateur ↔ entreprise

## 1. Traductions

- **Clés manquantes ajoutées** : toutes les clés utilisées dans le code (`i18n.translate('...')`)
  existent maintenant en `fr`, `en`, `es`, `sw` et `ar` (≈180 nouvelles traductions par langue).
- **Dictionnaires internes** (`measure`, `company-tariff`, `notifications`) : arabe ajouté.
- **Repli automatique** : langue demandée → anglais → français (I18nService et dictionnaires internes).
- **Nouveau fichier** `locales/<langue>/errors.json` : erreurs génériques, base de données,
  fichiers, validation (`validation.*`) et affectation (`company_assignment.*`).
- **Messages écrits en dur** dans les services (`throw new NotFoundException('Utilisateur non trouvé')`) :
  traduits automatiquement par le filtre global grâce à `src/common/errors/error-messages.catalog.ts`
  (185 messages). Les messages construits dynamiquement (`` `... ${x}` ``) restent dans leur langue d'origine.
- `auth.json` vides : ignorés proprement (plus d'erreur de parsing au démarrage).
- Textes corrompus (`Ã©`, `âœ…`) réparés dans `shipment.service.ts`, `users.service.ts`, `prospects.service.ts`.

La langue est lue dans cet ordre : `?lang=`, en-tête `x-lang`, `Accept-Language`, langue préférée de l'utilisateur.

## 2. Gestion globale des erreurs

Fichiers : `src/common/errors/*`, `src/common/interceptors/safe-class-serializer.interceptor.ts`, `src/main.ts`.

Toutes les erreurs renvoient le même format JSON, traduit :

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "code": "DUPLICATE_ENTRY",
  "message": "Cette valeur existe déjà (email : a@b.com)",
  "path": "/api/v1/users",
  "method": "POST",
  "timestamp": "2026-10-20T15:00:00.000Z",
  "requestId": "…"
}
```

| Cas | Statut | `code` |
|---|---|---|
| Validation DTO (avec `errors: [{ field, constraint, message }]`) | 400 | `VALIDATION_ERROR` |
| Doublon MySQL (`ER_DUP_ENTRY`) | 409 | `DUPLICATE_ENTRY` |
| Clé étrangère invalide / élément utilisé ailleurs | 400 / 409 | `INVALID_REFERENCE` / `RESOURCE_IN_USE` |
| Champ obligatoire, valeur trop longue, valeur ENUM invalide (`Data truncated`) | 400 | `REQUIRED_FIELD` / `VALUE_TOO_LONG` / `INVALID_VALUE` |
| Deadlock / base indisponible | 503 | `DATABASE_BUSY` / `DATABASE_UNAVAILABLE` |
| `findOneOrFail` sans résultat | 404 | `ENTITY_NOT_FOUND` |
| Upload : fichier trop gros, trop de fichiers, champ inattendu | 413 / 400 | `FILE_TOO_LARGE`, `TOO_MANY_FILES`, `UNEXPECTED_FILE_FIELD` |
| JWT expiré / invalide | 401 | `TOKEN_EXPIRED` / `TOKEN_INVALID` |
| JSON invalide / corps trop volumineux | 400 / 413 | `INVALID_JSON` / `PAYLOAD_TOO_LARGE` |
| Service externe (Axios) en erreur / délai dépassé | 502 / 504 | `EXTERNAL_SERVICE_ERROR` / `EXTERNAL_TIMEOUT` |
| Route inconnue | 404 | `NOT_FOUND` |
| Erreur inconnue | 500 | `INTERNAL_ERROR` (détail technique dans `debug` hors production) |

Autres protections :
- **SafeClassSerializerInterceptor** remplace `ClassSerializerInterceptor` (global et contrôleurs) :
  ne parcourt plus `res`, sockets, flux, Buffers → plus de crash `this.removeListener is not a function`.
- PDF commande / expédition renvoyés avec `StreamableFile`.
- `unhandledRejection` / `uncaughtException` journalisées au lieu d'arrêter le serveur
  (`PROCESS_EXIT_ON_UNCAUGHT=true` pour forcer l'arrêt + redémarrage par PM2).
- Échec au démarrage journalisé proprement, arrêt propre (`enableShutdownHooks`).

## 3. Affectation utilisateur ↔ entreprise

Un moteur commun (`applyCompanyAssignment` dans `CompanyService`) est utilisé par :

| Route | Méthode |
|---|---|
| `POST /company/assign` | `CreateUserToCompany` (accepte maintenant `branchId?` et `permissions?`) |
| `POST /company/admin/permissions` | `setUserCompanyPermissions` |
| `POST /company/admin/assign-user` | `assignUserToCompany` |

Règles :
1. **Branche** : celle envoyée → celle de l'affectation → branche active → première branche de l'entreprise
   (erreur claire si l'entreprise n'a aucune branche).
2. **Permissions envoyées** → appliquées immédiatement (ressources inexistantes ou non autorisées ignorées
   et listées dans `ignoredResourceIds`; erreur si aucune n'est valide).
3. **Aucune permission envoyée** :
   - première affectation, ou affectation existante **sans aucune permission** → permissions par défaut
     = ressources de l'entreprise avec leurs droits ;
   - propriétaire (`isOwner`) → tous les droits sur toutes les ressources de l'entreprise ;
   - affectation existante avec permissions → conservées.
4. `assign-user` : les droits sont plafonnés à ceux du propriétaire s'il en a, sinon aux ressources de l'entreprise.
5. Entreprise sans ressource configurée : les ressources envoyées sont acceptées et enregistrées pour l'entreprise.
6. Tout se fait dans **une transaction** (affectation + permissions + entreprise/branche active).

Réponse : `permissions`, `permissionsCount`, `wasAlreadyAssigned`, `defaultPermissionsApplied`,
`permissionsKept`, `ignoredResourceIds`, `branchId`, `branchName`.
