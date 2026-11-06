# FavorHelp backend — changements de novembre 2026

Préfixe de toutes les routes : `/api/v1`. Gardez toujours le `.env` et les certificats du serveur.
Scripts SQL : `db/sql/` (phpMyAdmin, base `favor_db`). Aucun n'utilise `information_schema`.
Erreurs à ignorer : #1050 (table existe), #1060 (colonne existe), #1061 (index existe).

## 1. Scripts SQL (ordre conseillé)

| # | Script | Contenu | Obligatoire |
|---|---|---|---|
| 1 | audit_logs_professionnel.sql | Journal d'audit professionnel | Oui (si pas déjà fait) |
| 2 | media_module_complet.sql | 16 tables du module Médias (prestataires inclus) | Oui (si pas déjà fait) |
| 3 | media_prestataires_tarifs.sql | Tarifs, domaines, conditions des prestataires | Oui (si pas déjà fait) |
| 4 | sessions_sauvegardes_bases_photo_prestataire.sql | Sessions, sauvegardes liées aux bases, photo prestataire | Oui (si pas déjà fait) |
| 5 | colis_devise.sql | Devise des colis (shipments.currency) | Oui (si pas déjà fait) |
| 6 | performance_index.sql | Index de performance admin / commandes | Oui (si pas déjà fait) |
| 7 | tresorerie_cash_flow.sql | 7 tables Trésorerie (bo_cash_transactions…) | Oui si absentes |
| 8 | tresorerie_circuit_validation.sql | 3 tables validation Trésorerie | Oui si absentes |
| 9 | horaires_travail_utilisateurs.sql | 3 tables Horaires de travail + ressource WORK_SCHEDULES | Oui |
| 10 | domaine_media_urls.sql | Liens en base → https://media.favorhelp.com | Optionnel |

## 2. Lignes .env à ajouter sur le serveur

```env
# Domaine média
MEDIA_BASE_URL=https://media.favorhelp.com
MEDIA_LEGACY_ORIGINS=https://api-prod.favorhelp.com

# Horaires de travail
WORK_SCHEDULE_ENABLED=true
WORK_SCHEDULE_DEFAULT_TIMEZONE=Africa/Lubumbashi
WORK_SCHEDULE_CACHE_SECONDS=60
WORK_SCHEDULE_EXCEPTION_MAX_DAYS=31
```

(Déjà fournies avant : AUDIT_*, SESSION_*, BACKUP_ENCRYPTION_KEY, MEDIA_VENDOR_PHOTO_MAX_MB,
SHIPMENT_CURRENCIES, DB_POOL_SIZE, DB_SLOW_QUERY_MS, SLOW_REQUEST_MS, HTTP_COMPRESSION.)

## 3. Domaine média (URL de l'API masquée)

- Nouveaux fichiers : `https://media.favorhelp.com/<dossier>/<fichier>` (servis par Apache, pas par l'API).
- Anciens liens `https://api-prod.favorhelp.com/uploads/...` réécrits automatiquement dans toutes les réponses.
- La route `/uploads` de l'API reste active pour les anciennes versions des applis.
- Apache : `deploy/apache/media.favorhelp.com.conf` et `deploy/apache/mime-media.conf` (types .webp, .avif…).
- Code : `src/files/media-url.util.ts`, `src/common/interceptors/media-url.interceptor.ts`, `files.service.ts`, `main.ts`.

## 4. Horaires et programmes de travail

Priorité (backend) : 1. Super Admin → 2. Dérogation valide → 3. Programme individuel → 4. Programme de l'entreprise → aucun programme = accès libre.

- Connexion refusée hors horaires (mot de passe, Google, Apple, renouvellement).
- Requêtes refusées hors horaires : 403 `code: OUTSIDE_WORK_HOURS` (sauf `POST /sessions/logout` et `GET /work-schedules/me`).
- Déconnexion automatique à la fin de la plage (à la seconde) : sessions fermées (motif OUTSIDE_WORK_HOURS),
  événement WebSocket `force-logout`, sockets coupés. Contrôle immédiat après chaque modification.
- Propriétaire exempté du programme de l'entreprise (sauf applyToOwners). Super Admin jamais bloqué.
- Gestion : propriétaire, permission WORK_SCHEDULES (can_manage / can_update), Super Admin (toutes entreprises, verrouillage).

| Méthode | Route | Rôle |
|---|---|---|
| GET | /work-schedules/me | Ma règle, mes plages, accessEndsAt, mes dérogations |
| GET | /work-schedules/company?companyId | Programme de l'entreprise |
| PUT | /work-schedules/company | Créer / modifier { name, timezone, isActive, graceMinutes, applyToOwners, isLocked*, validFrom, validUntil, notes, slots[] } |
| DELETE | /work-schedules/company?companyId | Supprimer le programme de l'entreprise |
| GET | /work-schedules/users?companyId&search&filter&page&limit | Utilisateurs + règle appliquée (filter = all, individual, company, exception, allowed, blocked) |
| POST | /work-schedules/users/bulk | Même programme pour plusieurs { userIds[], …programme } |
| GET | /work-schedules/users/:userId?companyId | Programme individuel + décision actuelle |
| PUT | /work-schedules/users/:userId | Créer / modifier le programme individuel |
| DELETE | /work-schedules/users/:userId?companyId | Supprimer (retour au programme de l'entreprise) |
| GET | /work-schedules/exceptions?companyId&userId&status&page&limit | Dérogations (active, upcoming, valid, expired, revoked, all) |
| POST | /work-schedules/exceptions | Accorder { userId, startsAt, endsAt, reason, companyId? } |
| POST | /work-schedules/exceptions/:id/revoke | Annuler { reason? } |
| GET | /work-schedules/check?userId&at&companyId | Simulation d'accès |
| GET | /work-schedules/companies?search&page&limit | Super Admin : vue d'ensemble |

\* isLocked : Super Admin uniquement.
Plage : `{ "dayOfWeek": 1..7 (lundi..dimanche), "startTime": "08:00", "endTime": "17:00" }` ; fin ≤ début = jusqu'au lendemain.

Applis : écouter `force-logout`, gérer 401 et 403 `OUTSIDE_WORK_HOURS` (dialog + retour à la connexion).

## 5. États de besoins — « Département introuvable »

- Lecture des départements robuste (SELECT *), erreurs journalisées.
- Département d'une autre entreprise accepté si le demandeur y appartient (ou admin plateforme), sinon message clair.
- Nouvelle route :

| Méthode | Route | Rôle |
|---|---|---|
| GET | /backoffice/needs/departments?companyId | Départements de l'entreprise active + defaultDepartmentId |

## 6. Autres travaux de la période

| Sujet | Routes / changements |
|---|---|
| Sessions | POST /sessions/logout ; GET /sessions/me ; DELETE /sessions/me/:id ; POST /sessions/me/revoke-others ; GET /sessions ; GET /sessions/stats ; DELETE /sessions/:id ; POST /sessions/users/:userId/revoke-all |
| Sauvegardes liées aux bases | /backup : databases (GET, POST, test, discover, :id, :id/test, :id/default, :id/backup), schedules (GET, POST, PATCH, DELETE, :id/run), runs, create, list, download, restore |
| Audit | /audit-logs : liste, stats, export, entity/:entity/:entityId, user/:userId, :id, :id/verify |
| Prestataires médias | /backoffice/media/vendors… : domains, rates, rates/export, :id/photo (POST, DELETE), :id/rates (GET, POST, PATCH, status, DELETE) |
| Colis | champ `currency` sur les colis (USD, CDF — SHIPMENT_CURRENCIES) |
| Performance | chargements admin, commandes restaurant (findByType), compression HTTP, index |
| Inscription | OTP et bienvenue envoyés par e-mail ET SMS |
| /users/me | correction ER_NONUNIQ_TABLE |

## 7. Déploiement

1. Copier le code (garder `.env` et `certs/` du serveur), ajouter les lignes `.env` ci-dessus.
2. Exécuter les scripts SQL manquants.
3. `npm install && npm run build`, puis redémarrer (ex. `pm2 restart all`).
4. Vérifier dans les logs : `Media URL: https://media.favorhelp.com`.
