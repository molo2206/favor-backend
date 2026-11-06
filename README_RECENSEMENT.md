# Recensement des clients et entreprises existants (relance des anciens clients)

Chaque fiche part toujours d'un **client existant** (`users`, `userId`) ou d'une **entreprise existante** (`company`, `vendorCompanyId`). Le nom, le téléphone, l'e-mail, la ville, le type et le propriétaire de l'entreprise sont repris de la plateforme. La fiche ajoute les informations du recensement et le suivi des relances.

Base `favor_db` : lancer `db/sql/recensement_clients_vendeurs.sql`. Il crée 2 nouvelles tables, `census_records` et `census_followups`. Aucune table existante n'est modifiée.

| Route | Rôle |
|---|---|
| `GET /commercial/census/candidates?type=CLIENT\|VENDOR&inactiveDays=90&withoutRecord=true&search=` | Clients ou entreprises existants, avec leurs commandes ou ventes, leur dernière activité et leur fiche (`record`, ou `null` s'ils ne sont pas encore recensés) |
| `POST /commercial/census` | `{ "type": "CLIENT", "userId": "…" }` ou `{ "type": "VENDOR", "vendorCompanyId": "…" }`, plus les infos du recensement |
| `POST /commercial/census/import-inactive` | `{ "type": "CLIENT", "inactiveDays": 90 }` crée en une fois les fiches des inactifs |
| `GET /commercial/census` | Fiches. Filtres : `type`, `status`, `cityId`, `assignedToId`, `search`, `due=true`, `inactiveDays` |
| `GET /commercial/census/stats` | Statistiques |
| `GET /commercial/census/:id` | Fiche, activité réelle sur la plateforme et historique des relances |
| `PATCH /commercial/census/:id` | Compléter la fiche. Le client ou l'entreprise de la fiche ne change pas |
| `DELETE /commercial/census/:id` | Supprimer |
| `POST /commercial/census/:id/followups` | `{ "result": "INTERESTED", "channel": "CALL", "note": "…" }` enregistre une relance |

Règles :
- Une seule fiche par client et une seule par entreprise.
- Chaque nuit, une fiche dont le client recommande, ou dont l'entreprise revend, passe automatiquement en `REACTIVATED`.
- Le filtre `cityId` de l'import ne s'applique qu'aux entreprises. Pour les clients, il n'a aucun effet.
