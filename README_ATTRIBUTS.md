# Attributs ↔ Produits ↔ Commandes

## 1. Ce qui change

| Avant | Maintenant |
|---|---|
| Un produit est seulement « lié » à un attribut (`product_attributes`) | Le lien porte aussi : obligatoire, sert aux variations, visible, ordre, valeur libre (`customValue`) |
| Aucune liste de valeurs par produit | `product_attribute_values` : valeurs autorisées par produit (Rouge, Bleu…) + supplément de prix |
| Création de variation cassée (`value` n'existe pas sur `variation_attribute_values`) | Corrigé : valeur retrouvée par `attributeValueId` **ou** créée à partir du texte `value` |
| Mise à jour du produit = toutes les variations supprimées puis recréées | Mise à jour par `id` / `sku`. Une variation déjà commandée est **archivée** (suppression douce), jamais supprimée |
| La commande ne garde pas le choix du client | `order_items` / `sub_order_items` : `variationId`, `sku`, `variationLabel`, `attributesSnapshot` + table `order_item_attributes` |
| `softDelete` d'un attribut en erreur (pas de colonne `deletedAt`) | Colonne `deletedAt` ajoutée + route de restauration |
| `GET /attributes/filterable` masqué par `GET /attributes/:id` | Ordre des routes corrigé |

## 2. Base de données

Migration : `db/migrations/1792536000000-AttributesProductOrderLink.ts` (relançable sans erreur).
Version SQL manuelle : `db/sql/attributs_produits_commandes.sql`.

```bash
npm run build
npm run migration:run      # ou votre commande habituelle
```

Paramètres `.env` (facultatifs) :

```env
ORDER_CHECK_VARIATION_STOCK=false        # true = refuse si stock de la variation insuffisant
ORDER_ENFORCE_REQUIRED_ATTRIBUTES=false  # true = exige les attributs obligatoires même pour les anciennes apps
```

## 3. Routes

### Attributs (existantes, enrichies)

| Méthode | Route | Nouveau |
|---|---|---|
| POST | `/attributes` | accepte `isVariant`, `isVisible`, `isActive`, `unit`, `position`, `categoryIds`, `values` |
| PATCH | `/attributes/:id` | idem |
| GET | `/attributes?active=true` | filtre actifs |
| GET | `/attributes/:attributeId/values?active=true` | filtre actifs |
| DELETE | `/attributes/value/:id` | ✅ supprime (ou désactive si utilisée) |
| PATCH | `/attributes/:id/restore` | ✅ restaure un attribut supprimé |

Types : `TEXT`, `COLOR`, `IMAGE`, `SELECT`, **`NUMBER`**, **`BOOLEAN`**.
`COLOR`, `IMAGE`, `SELECT` ont une liste de valeurs ; `TEXT`, `NUMBER`, `BOOLEAN` une valeur libre.

### Produit ↔ attributs ↔ variations (nouvelles)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/attributes/products/:productId` | Configuration complète pour l'app (attributs, valeurs autorisées, variations) |
| PUT | `/attributes/products/:productId/attributes` | Remplace les attributs du produit |
| POST | `/attributes/products/:productId/attributes` | Ajoute / modifie UN attribut |
| DELETE | `/attributes/products/:productId/attributes/:attributeId` | Retire un attribut |
| GET | `/attributes/products/:productId/variations?all=true` | Liste des variations |
| POST | `/attributes/products/:productId/variations` | Crée une variation |
| PUT | `/attributes/products/:productId/variations` | Remplace toutes les variations |
| POST | `/attributes/products/:productId/variations/generate` | Génère toutes les combinaisons |
| POST | `/attributes/products/:productId/variations/resolve` | Trouve la variation selon les choix du client |
| PATCH | `/attributes/variations/:id` | Modifie une variation |
| DELETE | `/attributes/variations/:id` | Supprime (ou archive si déjà commandée) |
| PUT | `/attributes/categories/:categoryId` | Attributs d'une catégorie (admin) |
| DELETE | `/attributes/categories/:categoryId/:attributeId` | (admin) |
| GET | `/attributes/orders/:orderId` | Attributs choisis dans une commande |

Les routes d'écriture produit exigent d'être connecté et rattaché à l'entreprise du produit (ou ADMIN / SUPER ADMIN).

### Création / modification de produit (routes existantes)

`attributes` accepte toujours l'ancien format :

```json
["uuid-couleur", "uuid-taille"]
```

et le nouveau :

```json
[
  {
    "attributeId": "uuid-couleur",
    "isRequired": true,
    "values": [
      { "value": "Rouge" },
      { "attributeValueId": "uuid-bleu", "isDefault": true }
    ]
  },
  {
    "attributeId": "uuid-taille",
    "isRequired": true,
    "values": [{ "value": "M" }, { "value": "XL", "priceAdjustment": 2 }]
  },
  { "attributeId": "uuid-matiere", "customValue": "100% coton" }
]
```

`variations` :

```json
[
  {
    "id": "uuid-variation-existante",
    "sku": "TSHIRT-ROUGE-XL",
    "retailPrice": 15,
    "wholesalePrice": 12,
    "stock": 20,
    "attributeValues": [
      { "attributeId": "uuid-couleur", "value": "Rouge" },
      { "attributeId": "uuid-taille", "attributeValueId": "uuid-xl" }
    ]
  }
]
```

`sku`, `name`, `retailPrice` et `wholesalePrice` sont facultatifs (générés / prix du produit par défaut).

## 4. Commande

Chaque ligne de `orderItems` accepte deux champs facultatifs :

```json
{
  "productId": "uuid-produit",
  "quantity": 2,
  "price": 15,
  "variationId": "uuid-variation",
  "attributes": [
    { "attributeId": "uuid-couleur", "attributeValueId": "uuid-rouge" },
    { "attributeId": "uuid-gravure", "value": "Joyeux anniversaire" }
  ]
}
```

- `variationId` : ses attributs sont repris automatiquement.
- `attributes` sans `variationId` : la variation correspondante est retrouvée automatiquement si elle existe.
- Tout est vérifié **avant le paiement** (valeur autorisée, variation active, attribut obligatoire, stock si activé).
- Les anciennes apps qui n'envoient ni `variationId` ni `attributes` continuent de fonctionner.

Chaque ligne de commande retourne ensuite :

```json
{
  "variationId": "uuid-variation",
  "sku": "TSHIRT-ROUGE-XL",
  "variationLabel": "Couleur : Rouge, Taille : XL",
  "attributesSnapshot": [
    { "attributeId": "…", "attributeValueId": "…", "name": "Couleur", "value": "Rouge", "color": "#FF0000", "priceAdjustment": 0 }
  ],
  "selectedAttributes": [ … ]
}
```

Le nom et la valeur sont **copiés** au moment de la commande : renommer ou supprimer un attribut plus tard ne modifie pas les commandes passées.
