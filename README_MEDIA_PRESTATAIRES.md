# Média — Prestataires externes

Gestion des acteurs externes du service Média : photographes et vidéastes freelances, pilotes de drone, monteurs, studios, agences, imprimeries. L'équipe interne reste gérée par les Ressources humaines.

## Fonctionnalités
- **Référentiel** : code automatique (PRS-0001…), personne ou structure, coordonnées, compte Favor Help lié (facultatif), compétences (familles de prestations et rôles), matériel, portfolio, réseaux sociaux, langues, tarif, moyen de paiement (Mobile Money, F-Pay, banque), NIF/RCCM, contrat et NDA. Les doublons (même nom, téléphone ou e-mail) sont refusés.
- **Statuts** : PROSPECT, ACTIVE, SUSPENDED, BLACKLISTED (motif obligatoire pour ces deux-là) et ARCHIVED. Seul un prestataire ACTIVE peut être engagé. La suppression d'un prestataire déjà engagé l'archive, ce qui conserve son historique.
- **Dossier** : pièces (identité, contrat, NDA, fiscal, assurance, facture, portfolio) avec date d'expiration. La fiche signale les pièces manquantes, et le tableau de bord les pièces qui expirent.
- **Missions** sur un projet et, si besoin, une séance :
  - la période est reprise de la séance ;
  - le chevauchement avec une autre mission est refusé ;
  - le coût par défaut est le tarif du prestataire.
  - Cycle : PROPOSED → CONFIRMED → IN_PROGRESS → DELIVERED → VALIDATED, ou CANCELLED. Le retour de DELIVERED à IN_PROGRESS correspond aux retouches.
- **Évaluation** à la validation (note globale ou qualité, ponctualité, communication) : la note moyenne du prestataire est recalculée.
- **Paiements** :
  - acomptes et soldes, jamais plus que le reste à payer ;
  - une mission déjà payée ne peut pas être annulée ;
  - l'annulation d'un paiement recalcule le solde.
- **Finances** : dettes envers les prestataires (dont la part exigible, travail rendu) et coût prestataires par projet avec la marge. Le relevé d'un prestataire s'exporte en JSON, Excel ou PDF.
- **Historique du projet** : VENDOR_ASSIGNED, VENDOR_UPDATED, VENDOR_PAYMENT. Les types SOCIAL_POST et SOCIAL_CAMPAIGN manquaient en base ; ils sont ajoutés aussi.
- **Notifications** :
  - au prestataire s'il a un compte : nouvelle mission, annulation, validation, paiement ;
  - au chef de projet : travail rendu à valider.
- **Journal d'audit** sur toutes les écritures ; paiements en catégorie FINANCE.
- Messages en 5 langues (`locales/*/media_vendor.json`).

## API (préfixe /api/v1/backoffice/media, utilisateur connecté de l'entreprise)
| Méthode | Route | Rôle |
|---|---|---|
| GET | vendors/dashboard | Tableau de bord (statuts, dettes, payé ce mois, missions à confirmer, à valider ou en retard, pièces qui expirent, contrats qui finissent, meilleurs prestataires) |
| GET | vendors/payables | Montants dus par prestataire et par devise |
| GET | vendors/availability?startAt&endAt&category&role | Prestataires libres ou occupés |
| POST | vendors | Créer |
| GET | vendors?status&type&category&role&city&minRating&withBalance&search&sortBy&sortOrder&page&limit | Liste paginée, avec soldes |
| GET | vendors/:id | Fiche : dossier, pièces manquantes, statistiques, missions à venir et récentes, paiements |
| PATCH | vendors/:id | Modifier |
| PATCH | vendors/:id/status | Changer le statut `{ status, reason }` |
| DELETE | vendors/:id | Supprimer ou archiver |
| GET | vendors/:id/statement?from&to&format=json\|xlsx\|pdf | Relevé |
| POST | vendors/:id/documents | Ajouter une pièce (multipart : `file`, `type`, `title`, `expiresAt`, `note`, ou `url`) |
| DELETE | vendors/:id/documents/:documentId | Supprimer une pièce |
| POST | projects/:id/vendors | Engager `{ vendorId, sessionId?, role, startAt, endAt, dueAt, quantity, unit, unitCost, currency, confirmed }` |
| GET | projects/:id/vendors | Prestataires du projet, coûts et marge |
| GET | vendor-assignments?vendorId&projectId&status&paymentStatus&late&from&to&search&page&limit | Missions |
| GET | vendor-assignments/:id | Détail, paiements et statuts possibles |
| PATCH | vendor-assignments/:id | Modifier la mission (période, coût…) |
| PATCH | vendor-assignments/:id/status | `{ status, reason, deliveryUrl, rating, quality, punctuality, communication, review }` |
| DELETE | vendor-assignments/:id | Supprimer une mission proposée ou annulée, sans paiement |
| POST | vendor-assignments/:id/payments | Payer `{ amount, method, reference, receiptUrl, paidAt, note }` |
| DELETE | vendor-assignments/:id/payments/:paymentId | Annuler un paiement |

## Installation
1. Exécutez `db/sql/media_prestataires.sql` sur favor_db. Le script crée de nouvelles tables et ajoute des types d'historique ; aucune donnée existante n'est touchée.
2. Facultatif : ajoutez `MEDIA_VENDOR_DOC_MAX_MB=20` dans le `.env`.
3. Lancez `npm run build`, puis redémarrez.
