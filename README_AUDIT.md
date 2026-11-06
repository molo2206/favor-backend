# Journal d'audit Favor Help

Le journal répond à six questions pour chaque opération : qui l'a faite, quoi, sur quelle ressource, quand, depuis où, et avec quel résultat.

## Fonctionnement
1. **AuditContextMiddleware** (premier middleware) crée l'identifiant de requête (`x-request-id`), récupère l'IP réelle (IpReputationService) et ouvre le contexte d'audit (AsyncLocalStorage).
2. **AuditInterceptor** ajoute au contexte la route, le `@AuditAction` éventuel, la réponse ou l'erreur.
3. **AuditSubscriber** (TypeORM) capte chaque INSERT, UPDATE et DELETE réel pendant la requête, avec les valeurs avant et après de chaque champ modifié.
4. **AllExceptionsFilter** transmet le code et le message de l'erreur.
5. Une fois la réponse envoyée, **AuditService.fromRequest** décide s'il faut écrire, classe l'opération (`audit.rules.ts`), masque les données sensibles (`audit-sanitize.ts`), signe la ligne (HMAC) et l'ajoute à la file. Les lignes sont écrites par lots, chaque seconde. L'audit ne bloque jamais une requête.

## Ce qui est journalisé
- Les routes annotées `@AuditAction(...)` : l'existant fonctionne sans changement, avec maintenant le bon auteur.
- Automatiquement, chaque POST, PUT, PATCH et DELETE (`AUDIT_AUTO_MUTATIONS=true`), succès comme échecs.
- Les connexions réussies (`LOGIN`) et échouées (`LOGIN_FAILED`, avec l'identifiant tenté), l'inscription, les mots de passe (oubli, réinitialisation, changement), l'OTP et la double authentification (2FA).
- Les rôles, les permissions, l'activation ou le blocage d'un compte et la suppression d'un compte (CRITICAL).
- Les accès refusés (403 → `ACCESS_DENIED`) et les échecs de rafraîchissement de jeton.
- La finance : F-Pay, PawaPay, transactions, retraits, paiements, remboursements, trésorerie, paie, décaissements des états de besoins.
- L'administration : sauvegardes (y compris les sauvegardes programmées), restauration (CRITICAL), téléchargement d'une sauvegarde (CRITICAL), paramètres, tarifs et taux.
- Les exports.

Ne sont pas journalisés : les lectures simples (GET non annotés), les positions GPS, les cartes, les accusés de lecture et les jetons d'appareil. Pour ignorer d'autres routes, utilisez `AUDIT_EXCLUDE_PATHS` ou `@SkipAudit()`.

## Données sensibles
Les mots de passe, jetons, OTP, PIN, CVV, numéros de carte, clés API et clés privées sont remplacés par `***`. Pour les routes de connexion, seul l'identifiant tenté est conservé. Les listes sont résumées à leur nombre d'éléments, et les valeurs sont limitées à `AUDIT_MAX_JSON_KB`.

## Utilisation dans un service (facultatif)
```ts
constructor(private readonly audit: AuditService) {}   // module global, aucun import nécessaire

this.audit.annotate({ oldValue: before, entityId: id });              // complète le journal de la requête en cours
this.audit.record({ action: ActionType.SYSTEM, entity: 'rides', ... }); // tâche planifiée, hors requête HTTP
```

## API (ADMIN / SUPER ADMIN), lecture seule
| Route | Rôle |
|---|---|
| `GET /api/v1/audit-logs` | Liste paginée (`PaginatedResponseDto`). Filtres : userId, action (plusieurs séparées par des virgules), entity, entityId, category, severity, status, platform, ipAddress, method, companyId, requestId, from, to, search, sortOrder, page, limit |
| `GET /api/v1/audit-logs/stats?from&to` | Totaux, connexions échouées, refus, échecs, critiques, répartitions, activité par jour, utilisateurs les plus actifs, IP suspectes |
| `GET /api/v1/audit-logs/export?format=xlsx\|pdf` | Export avec les mêmes filtres (l'export lui-même est journalisé) |
| `GET /api/v1/audit-logs/entity/:entity/:entityId` | Historique d'une ressource |
| `GET /api/v1/audit-logs/user/:userId` | Activité d'un utilisateur |
| `GET /api/v1/audit-logs/:id` | Détail |
| `GET /api/v1/audit-logs/:id/verify` | Vérifie la signature (ligne intacte ou modifiée) |

Aucune route ne modifie ni ne supprime une ligne. La purge nocturne (03:30) supprime les lignes plus anciennes que `AUDIT_RETENTION_DAYS` (730 par défaut, 0 = illimité), mais conserve toujours les lignes CRITICAL.

## Installation
1. Exécutez `db/sql/audit_logs_professionnel.sql` sur favor_db. Ignorez les erreurs #1060 et #1061 : la colonne ou l'index existe déjà.
2. Ajoutez au `.env` du serveur les variables `AUDIT_*`. Générez votre propre clé avec `openssl rand -hex 32`, et ne la changez plus ensuite.
3. Lancez `npm run build`, puis redémarrez.
