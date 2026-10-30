# Tableau de bord de l'entreprise active

`GET /company-dashboard?startDate=2026-10-01&endDate=2026-10-30` (connecté)

- Entreprise : `user.activeCompanyId`. Un super admin peut ajouter `companyId`.
- Période : 30 derniers jours par défaut. Chaque KPI est comparé à la période précédente de même durée (`previous`, `change` en %).
- Aucune modification de la base : lecture seule.

| Type | Contenu |
|---|---|
| RESTAURANT | Commandes, CA par devise, panier moyen, paiements, heures et jours de pointe, top plats, top clients, livraisons (délais, livreurs), disponibilité des plats (taux de réponse, plats souvent indisponibles, commandes en attente) |
| SHOP / GROCERY / CAR | Comme RESTAURANT, avec en plus le stock (ruptures, stock faible, produits non vendus) |
| SERVICE | Comme SHOP, avec en plus les services |
| HOTEL | Réservations, CA, nuitées, prix moyen par nuit, taux d'occupation, durée moyenne, top chambres, arrivées des 7 prochains jours, clients présents |
| TRANSPORT_AGENCY | Voyages, réservations, places vendues, taux de remplissage, véhicules, paiements, départs des 7 prochains jours |
| SHIPPING / LOGISTIC_AGENCY / AGENCE | Colis par statut et par rôle (enlèvement, expédition, livraison), CA, impayés, routes principales, LTA, colis en agence |
| TAXI | Courses, CA, commissions, gains chauffeurs, paiements, annulations, heures de pointe, top chauffeurs, flotte |

Tous les types reçoivent aussi :
- `kpis`, `charts.timeline` (jour par jour) et `alerts` ;
- `team` : membres et branches ;
- `finance` : frais et transactions de l'entreprise, impayés.

Si un bloc échoue, il vaut `null` et son nom apparaît dans `warnings`. Le reste du tableau de bord est quand même renvoyé.
