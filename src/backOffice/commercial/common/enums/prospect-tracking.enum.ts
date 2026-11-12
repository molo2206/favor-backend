// src/backOffice/commercial/common/enums/prospect-tracking.enum.ts

/** ✅ Réseau social précisé quand la source du prospect est « Réseau social » */
export enum ProspectSocialNetwork {
  FACEBOOK = 'FACEBOOK',
  TIKTOK = 'TIKTOK',
  INSTAGRAM = 'INSTAGRAM',
  WHATSAPP = 'WHATSAPP',
  LINKEDIN = 'LINKEDIN',
  OTHER = 'OTHER',
}

/** ✅ Actions historisées sur un prospect */
export enum ProspectHistoryAction {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  ASSIGNED = 'ASSIGNED',
  TRANSFERRED = 'TRANSFERRED',
  UNASSIGNED = 'UNASSIGNED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  PROCESSED = 'PROCESSED',
  CONVERTED = 'CONVERTED',
  ACCOUNT_LINKED = 'ACCOUNT_LINKED',
  ACCOUNT_UNLINKED = 'ACCOUNT_UNLINKED',
  DUPLICATE_WARNING = 'DUPLICATE_WARNING',
  DELETED = 'DELETED',
}

/** ASSIGNED = premier responsable ; TRANSFERRED = changement de responsable ; UNASSIGNED = plus de responsable */
export enum ProspectAssignmentType {
  ASSIGNED = 'ASSIGNED',
  TRANSFERRED = 'TRANSFERRED',
  UNASSIGNED = 'UNASSIGNED',
}

/** « Réseau social » quel que soit le libellé envoyé par le front (SOCIAL_NETWORK, Réseau social, Social media…) */
export function isSocialSource(source?: string | null): boolean {
  return !!source && /social|r[ée]seau/i.test(source);
}

/** Statuts considérés comme « traités » (tout sauf NEW) */
export const PROSPECT_PENDING_STATUSES = ['NEW'];
