/**
 * ✅ Disponibilité d'un produit dans une commande, confirmée par son propriétaire (order_items.availabilityStatus)
 *    PENDING     → en attente de confirmation
 *    AVAILABLE   → produit disponible
 *    UNAVAILABLE → produit indisponible
 *    NULL        → anciennes commandes (avant cette fonctionnalité)
 */
export enum ItemAvailabilityStatus {
  PENDING = 'PENDING',
  AVAILABLE = 'AVAILABLE',
  UNAVAILABLE = 'UNAVAILABLE',
}

/**
 * Résumé calculé pour une commande (non enregistré) :
 *    PENDING     → au moins un produit attend la réponse de son propriétaire
 *    AVAILABLE   → tous les produits sont disponibles
 *    PARTIAL     → une partie seulement est disponible
 *    UNAVAILABLE → aucun produit disponible
 */
export enum OrderAvailabilitySummary {
  PENDING = 'PENDING',
  AVAILABLE = 'AVAILABLE',
  PARTIAL = 'PARTIAL',
  UNAVAILABLE = 'UNAVAILABLE',
}

/**
 * Seulement les commandes RESTAURANT (les autres types : rien ne change).
 * ORDER_AVAILABILITY_CHECK=false dans le .env désactive la confirmation (fonctionnement d'avant).
 */
export function availabilityRequiredFor(orderType?: string | null): boolean {
  if (String(process.env.ORDER_AVAILABILITY_CHECK ?? 'true').trim().toLowerCase() === 'false') return false;
  return String(orderType || '').toUpperCase() === 'RESTAURANT';
}

/** Résumé d'une liste de statuts de produits */
export function summarizeAvailability(statuses: (string | null | undefined)[]): OrderAvailabilitySummary | null {
  const list = statuses.filter(Boolean) as string[];
  if (!list.length) return null;
  if (list.includes(ItemAvailabilityStatus.PENDING)) return OrderAvailabilitySummary.PENDING;
  const available = list.filter((s) => s === ItemAvailabilityStatus.AVAILABLE).length;
  if (available === list.length) return OrderAvailabilitySummary.AVAILABLE;
  if (available === 0) return OrderAvailabilitySummary.UNAVAILABLE;
  return OrderAvailabilitySummary.PARTIAL;
}
