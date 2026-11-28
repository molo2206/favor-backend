import { CompanyType } from 'src/company/enum/type.company.enum';

/**
 * ✅ CAPACITÉS PAR TYPE D'ENTREPRISE (« dynamisation »)
 *
 *  Chaque fonctionnalité (inventaire, POS, offline, lots, péremption, ordonnance…)
 *  est un simple interrupteur. Le comportement du système s'adapte au type SANS code en dur :
 *  on lit ces capacités, on ne teste jamais `if (type === 'PHARMACIE')` dans la logique métier.
 *
 *  Les valeurs ci-dessous sont les DÉFAUTS (code). Elles peuvent être surchargées par
 *  la table `type_company_config` (voir CompanyCapabilitiesService) pour ajuster sans redéployer.
 */
export interface CompanyCapabilities {
  /** Gestion d'inventaire avancée (emplacements, mouvements, inventaire tournant) */
  hasInventory: boolean;
  /** Caisse / point de vente (ventes directes, sessions de caisse) */
  hasPOS: boolean;
  /** Fonctionnement hors-ligne autorisé (caisse locale + synchro) */
  offlineEnabled: boolean;
  /** Suivi par LOT (numéro de lot, fournisseur) */
  tracksLots: boolean;
  /** Suivi des dates de PÉREMPTION (FEFO : plus proche périmé sorti en premier) */
  tracksExpiry: boolean;
  /** Certains produits exigent une ORDONNANCE pour être vendus */
  requiresPrescription: boolean;
  /** Registre des produits CONTRÔLÉS (psychotropes, stupéfiants) */
  controlledRegister: boolean;
  /** Vente à l'UNITÉ / fraction (plaquette, comprimé) et pas seulement la boîte */
  sellByFraction: boolean;
  /** Autoriser un stock NÉGATIF (vente même sans stock enregistré) */
  allowNegativeStock: boolean;
  /**
   * Fabrication SUR COMMANDE (sur-mesure) : le client commande un modèle à confectionner.
   * → pas de décrément du stock « produit », étape de confirmation par l'entreprise avant confection,
   *   prix ajustable selon la taille (voir module atelier).
   */
  madeToOrder: boolean;
  /** Opérations autorisées HORS-LIGNE (si offlineEnabled). Les autres sont refusées offline. */
  offlineAllowedOps: OfflineOp[];
}

/** Opérations que la caisse peut réaliser hors-ligne */
export enum OfflineOp {
  SALE = 'SALE', // vente comptant
  STOCK_OUT = 'STOCK_OUT', // sortie de stock
  STOCK_IN = 'STOCK_IN', // réception de stock
  PRICE_LOOKUP = 'PRICE_LOOKUP', // consultation prix/stock
  PRESCRIPTION_SALE = 'PRESCRIPTION_SALE', // vente d'un produit sur ordonnance
  PRODUCT_MANAGE = 'PRODUCT_MANAGE', // créer / modifier un produit hors-ligne
}

/** Toutes les capacités à FALSE (base pour les types sans commerce : TAXI, SHIPPING…) */
const NONE: CompanyCapabilities = {
  hasInventory: false,
  hasPOS: false,
  offlineEnabled: false,
  tracksLots: false,
  tracksExpiry: false,
  requiresPrescription: false,
  controlledRegister: false,
  sellByFraction: false,
  allowNegativeStock: false,
  madeToOrder: false,
  offlineAllowedOps: [],
};

/** Commerce de détail standard (SHOP, GROCERY) : inventaire + POS + offline simple */
const RETAIL: CompanyCapabilities = {
  ...NONE,
  hasInventory: true,
  hasPOS: true,
  offlineEnabled: true,
  tracksLots: false,
  tracksExpiry: false,
  allowNegativeStock: false,
  offlineAllowedOps: [OfflineOp.SALE, OfflineOp.STOCK_OUT, OfflineOp.STOCK_IN, OfflineOp.PRICE_LOOKUP, OfflineOp.PRODUCT_MANAGE],
};

/** Défauts par type d'entreprise */
export const CAPABILITIES_BY_TYPE: Record<string, CompanyCapabilities> = {
  [CompanyType.SHOP]: { ...RETAIL },
  [CompanyType.GROCERY]: { ...RETAIL },

  // 🍽️ Restaurant : inventaire des INGRÉDIENTS + POS, mais stock négatif toléré (on sert même si le stock n'est pas tenu au gramme près)
  [CompanyType.RESTAURANT]: {
    ...RETAIL,
    tracksExpiry: true, // DLC des denrées
    allowNegativeStock: true,
    offlineAllowedOps: [OfflineOp.SALE, OfflineOp.STOCK_OUT, OfflineOp.PRICE_LOOKUP, OfflineOp.PRODUCT_MANAGE],
  },

  // 💊 PHARMACIE : lots + péremption (FEFO) + ordonnance + registre contrôlé + vente à l'unité.
  //    Hors-ligne : vente simple OK, mais la vente d'un produit SUR ORDONNANCE est INTERDITE offline
  //    (elle doit être tracée en ligne), et jamais de stock négatif sur un médicament.
  [CompanyType.PHARMACIE]: {
    hasInventory: true,
    hasPOS: true,
    offlineEnabled: true,
    tracksLots: true,
    tracksExpiry: true,
    requiresPrescription: true,
    controlledRegister: true,
    sellByFraction: true,
    allowNegativeStock: false,
    madeToOrder: false,
    offlineAllowedOps: [OfflineOp.SALE, OfflineOp.STOCK_OUT, OfflineOp.PRICE_LOOKUP, OfflineOp.PRODUCT_MANAGE],
  },

  // 🧵 ATELIER DE COUTURE : fabrication SUR COMMANDE (sur-mesure).
  //    - madeToOrder : le modèle est confectionné après commande (pas de décrément de stock produit)
  //    - allowNegativeStock : on accepte la commande même sans stock du modèle
  //    - hasInventory/hasPOS : désactivés par défaut (gestion des tissus / boutique → à activer
  //      par entreprise via type_company_config si besoin)
  [CompanyType.ATELIER_COUTURE]: {
    ...NONE,
    madeToOrder: true,
    allowNegativeStock: true,
  },
};

/** Capacités par défaut (code) pour un type donné ; NONE si le type n'a pas de commerce. */
export function defaultCapabilities(type?: string | null): CompanyCapabilities {
  if (!type) return { ...NONE };
  return { ...(CAPABILITIES_BY_TYPE[String(type).toUpperCase()] || NONE) };
}

/** Clés booléennes surchargeables depuis la base (type_company_config) */
export const BOOLEAN_CAPABILITY_KEYS: (keyof CompanyCapabilities)[] = [
  'hasInventory',
  'hasPOS',
  'offlineEnabled',
  'tracksLots',
  'tracksExpiry',
  'requiresPrescription',
  'controlledRegister',
  'sellByFraction',
  'allowNegativeStock',
  'madeToOrder',
];
