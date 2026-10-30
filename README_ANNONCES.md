# Annonces (type Jiji) — `src/classifieds`

N'importe quel utilisateur connecté peut publier une annonce, **sans avoir d'entreprise**.
La mise en ligne est **payante** selon un **tarif dynamique par ville** (et éventuellement par catégorie).

## Une annonce = une ligne de la table `products`
| Élément | Où |
|---|---|
| Annonce | `products` avec `listingType = 'CLASSIFIED'`, `company = NULL`, `ownerId` = l'auteur, `adCityId` = la ville |
| Titre, description, prix, catégorie, marque, modèle, année, couleur, carburant, boîte, vente/location | colonnes **existantes** de `products` (`name`, `description`, `price`, `category_id`, `brand_id`, `model`, `year`, `color`, `fuelType`, `transmission`, `typecar`, `type`) |
| Cycle, devise, état, contact, forfait, dates, vues… | nouvelles colonnes `ad*` de `products` |
| Photos | table existante `image_product_entity` (+ `products.image` = couverture, signature visuelle pour la recherche par image) |
| Favoris | **wishlist existante** : `POST /products/add/new/wishlist` `{ productId }`, `GET /products/get/wishlist`, `DELETE /products/:productId/wishlist/delete` |
| Détail produit existant | `GET /products/:id` fonctionne aussi pour une annonce (company = null) |
| Statut produit | aligné automatiquement : annonce en ligne → `PUBLISHED` (visible dans les listes de produits publiés par catégorie / type), vendue → `SOLD`, refusée → `REJECTED`, sinon `PENDING` |
| Commande | **refusée** pour une annonce (`order.classified_not_orderable`, vérifié avant tout paiement) : on contacte l'annonceur |
| Produits d'entreprise | inchangés (`listingType = 'PRODUCT'` par défaut, colonnes `ad*` vides) |

👉 Côté app : si `listingType === 'CLASSIFIED'`, afficher « Contacter / WhatsApp » (`POST /classifieds/public/:id/contact`) au lieu de « Ajouter au panier ».

## Mise en place
1. Exécuter `db/sql/annonces_classifieds.sql` **en entier** dans phpMyAdmin (sans procédure, idempotent, détecte la base tout seul) — ou `npm run migration:run` (migration `1793059200000-ClassifiedAds`).
   Il rend `products.companyId` facultatif, ajoute les colonnes d'annonce à `products`, crée `classified_pricing_plans`, `classified_payments`, `classified_reports`, et supprime les tables de la 1re version (`classified_ads`, `classified_ad_images`, `classified_favorites`) si elles existent.
2. Créer les tarifs (admin) : `POST /api/v1/admin/classifieds/pricing-plans` (voir plus bas).
3. Variables `.env` facultatives :

| Variable | Défaut | Rôle |
|---|---|---|
| `CLASSIFIED_MODERATION` | `false` | `true` = une annonce payée attend la validation d'un admin avant d'être en ligne |
| `CLASSIFIED_FREE_MAX_ACTIVE` | `3` | Annonces **gratuites** en ligne max par utilisateur (si un forfait à 0) |
| `CLASSIFIED_REQUIRE_IMAGE` | `true` | Au moins une photo pour publier |
| `CLASSIFIED_MAX_IMAGES` | `10` | Photos max à l'envoi (le forfait peut limiter davantage) |
| `CLASSIFIED_MAX_IMAGE_MB` | `10` | Poids max d'une photo |
| `CLASSIFIED_REMINDER_DAYS` | `2` | Rappel « bientôt expirée » X jours avant la fin |

## Parcours de l'annonceur
1. **Créer** : `POST /classifieds` (multipart : `name`, `description`, `categoryId`, `cityId`, `price`, `currency`, `type` SHOP/CAR/SERVICE…, `condition`, `negotiable`, `brandId`, `model`, `year`, `color`, `fuelType`, `transmission`, `typecar`, `location`, `contactPhone`, `whatsapp`, `showPhone` + `images[]`) → ligne `products`, statut d'annonce `DRAFT`.
2. **Voir les tarifs de sa ville** : `GET /classifieds/public/pricing?cityId=…&categoryId=…`.
3. **Payer** : `POST /classifieds/:id/pay`
   - FPay : `{ "planId": "…", "paymentMethod": "FPAY", "access_token": "…" }`
   - Mobile Money (Pawapay) : `{ "planId": "…", "paymentMethod": "MOBILE_MONEY", "provider": "VODACOM_MPESA_COD", "phone": "243970000000" }`
   - Forfait gratuit (prix 0) : `{ "planId": "…", "paymentMethod": "FREE" }`
4. Résultat :
   - payé → `ACTIVE` jusqu'à `expiresAt` (ou `PENDING_REVIEW` si modération activée) ;
   - Mobile Money non encore confirmé → `PENDING_PAYMENT` ; vérification automatique toutes les 2 min, ou `GET /classifieds/payments/:paymentId` ;
   - échec → retour en `DRAFT`, notification.
5. **Renouveler** : même route `pay` (annonce `ACTIVE` ou `EXPIRED`) — la durée s'ajoute au temps restant et l'annonce remonte en tête des récentes.
6. Notifications (base + WebSocket + push Firebase) : en ligne, en validation, validée, refusée, paiement échoué, bientôt expirée, expirée.

Cycle : `DRAFT → (PENDING_PAYMENT) → (PENDING_REVIEW) → ACTIVE → EXPIRED` ; aussi `SOLD`, `CLOSED`, `REJECTED`.

## Tarification dynamique par ville
Chaque forfait a un **code** (ex. `STANDARD_30J`, `TOP_30J`). Plusieurs lignes peuvent porter le même code ; pour une annonce, **la plus précise gagne** :

`ville + catégorie` > `ville` > `pays + catégorie` > `pays` > `catégorie` > `tarif général`

Exemple :

| code | ville | catégorie | prix |
|---|---|---|---|
| STANDARD_30J | — | — | 2 USD (partout) |
| STANDARD_30J | Kinshasa | — | 3 USD |
| STANDARD_30J | Kinshasa | Véhicules | 5 USD |
| TOP_30J (mise en avant) | — | — | 5 USD |

→ À Goma : Standard 2 USD, Top 5 USD. À Kinshasa : Standard 3 USD (5 USD pour un véhicule), Top 5 USD.

- Un forfait peut avoir `isFeatured: true` (annonce en tête des résultats), `durationDays`, `maxImages`, `currency`.
- Prix `0` = gratuit (limité par `CLASSIFIED_FREE_MAX_ACTIVE`).
- Le paiement garde une copie du forfait (`planSnapshot`) : changer un prix n'affecte que les prochains paiements.
- Le serveur vérifie que le forfait payé est bien celui de la ville de l'annonce, et la ville d'une annonce payée ne peut plus changer.

## Routes (préfixe `/api/v1`)

### Public — `/classifieds/public` (sans connexion ; avec jeton : `isFavorite`)
| Méthode | Route | Rôle |
|---|---|---|
| GET | `pricing?cityId=&categoryId=` | Tarifs applicables |
| GET | `?keyword=&categoryId=&cityId=&countryId=&type=&brandId=&typecar=&year=&minPrice=&maxPrice=&currency=&condition=&negotiable=&featuredOnly=&userId=&sort=recent\|price_asc\|price_desc\|popular&page=&limit=` | Recherche (sous-catégories incluses, annonces mises en avant d'abord) |
| GET | `:id` | Détail (+ vendeur, annonces similaires) — compte une vue |
| POST | `:id/contact` | Téléphone / WhatsApp du vendeur — compte un contact |

### Annonceur — `/classifieds` (connecté)
| Méthode | Route | Rôle |
|---|---|---|
| POST | `` | Créer (multipart, `images[]`) |
| GET | `mine?status=` · `mine/:id` | Mes annonces (+ compteurs) · détail + paiements |
| PATCH | `:id` | Modifier (multipart : nouvelles `images[]`, `removeImageIds`, `coverImageId`) |
| DELETE | `:id/images/:imageId` | Supprimer une photo |
| POST | `:id/pay` | Payer / renouveler |
| GET | `payments/:paymentId` | Statut d'un paiement |
| PATCH | `:id/sold` · `:id/close` | Vendu · retirer |
| DELETE | `:id` | Supprimer |
| POST | `:id/report` | Signaler `{ reason, message }` |

### Administration — `/admin/classifieds` (ADMIN / SUPER ADMIN)
| Méthode | Route | Rôle |
|---|---|---|
| POST / GET | `pricing-plans` | Créer / lister les tarifs (filtres `cityId`, `countryId`, `categoryId`, `code`, `globalOnly`) |
| PATCH / DELETE | `pricing-plans/:id` | Modifier / supprimer (désactivé s'il a déjà servi) |
| POST | `pricing-plans/copy-to-city/:cityId?percent=20` | Copier les tarifs généraux vers une ville (± %) |
| GET | `pricing-preview?cityId=&categoryId=` | Aperçu des tarifs d'une ville |
| GET | `ads?status=PENDING_REVIEW&cityId=…` | Annonces / file de modération |
| PATCH | `ads/:id/approve` · `ads/:id/reject` `{ reason }` | Valider · refuser / retirer |
| POST | `ads/:id/manual-payment` `{ planId, reference }` | Paiement reçu hors application (espèces, agence) |
| GET / PATCH | `reports` · `reports/:id` `{ status, resolution, takeDown }` | Signalements |
| GET | `revenue?from=&to=&cityId=` | Recettes par ville, forfait, moyen de paiement, jour |

## À savoir
- Pas de remboursement automatique (refus, retrait, annonce close avant la fin).
- Une annonce refusée **pendant la modération** garde sa durée payée : l'annonceur corrige et elle repart en validation sans repayer.
- **Recherche produits existante** (`ProductsService.search`) : les annonces en ligne sont incluses dans les mêmes résultats `data.PRODUCT` (company = null, `listingType = 'CLASSIFIED'`, ville dans `adCity`, auteur dans `owner`) ; filtres `cityId` / `countryId` sur la ville de l'annonce ; `meta.classifieds` = nombre d'annonces trouvées. `GET /classifieds/public` reste disponible pour les filtres avancés (prix, état, marque…).
- ⚠️ Exécuter le script SQL **avant** de déployer ce code : la recherche produits utilise les nouvelles colonnes de `products`.
- L'id d'une annonce est l'id du produit : toutes les routes `/classifieds/:id` prennent un `products.id`.
