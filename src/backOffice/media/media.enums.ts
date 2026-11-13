// ============================================================
// BackOffice — Média (filmage, photographie, services digitaux)
// ============================================================

/** Famille de prestation */
export enum MediaServiceCategory {
  PHOTOGRAPHY = 'PHOTOGRAPHY', // photographie
  VIDEOGRAPHY = 'VIDEOGRAPHY', // filmage / tournage
  DRONE = 'DRONE', // prises de vue aériennes
  LIVE_STREAMING = 'LIVE_STREAMING', // diffusion en direct
  EDITING = 'EDITING', // montage, retouche, post-production
  GRAPHIC_DESIGN = 'GRAPHIC_DESIGN', // affiches, logos, visuels
  SOCIAL_MEDIA = 'SOCIAL_MEDIA', // gestion des réseaux sociaux, community management
  WEB_DIGITAL = 'WEB_DIGITAL', // sites, campagnes digitales, publicité en ligne
  PRINTING = 'PRINTING', // impression (tirages, albums, bâches)
  OTHER = 'OTHER',
}

/** Unité de facturation d'une prestation */
export enum MediaUnit {
  HOUR = 'HOUR',
  DAY = 'DAY',
  SESSION = 'SESSION',
  PROJECT = 'PROJECT',
  ITEM = 'ITEM', // par photo, par visuel, par vidéo…
  MONTH = 'MONTH', // abonnement (réseaux sociaux…)
}

/** Client externe (payant) ou demande interne (département / entreprise du groupe) */
export enum MediaProjectKind {
  EXTERNAL = 'EXTERNAL',
  INTERNAL = 'INTERNAL',
}

/** Cycle d'un projet média */
export enum MediaProjectStatus {
  REQUEST = 'REQUEST', // demande reçue
  QUOTED = 'QUOTED', // devis envoyé
  CONFIRMED = 'CONFIRMED', // accepté par le client
  IN_PRODUCTION = 'IN_PRODUCTION', // tournage / séances photo
  POST_PRODUCTION = 'POST_PRODUCTION', // montage, retouche
  DELIVERED = 'DELIVERED', // fichiers livrés
  COMPLETED = 'COMPLETED', // clôturé
  CANCELLED = 'CANCELLED',
}

export enum MediaPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum MediaPaymentStatus {
  UNPAID = 'UNPAID',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  NOT_APPLICABLE = 'NOT_APPLICABLE', // projet interne non facturé
}

/** Séance planifiée (tournage, shooting, montage…) */
export enum MediaSessionType {
  PHOTO = 'PHOTO',
  VIDEO = 'VIDEO',
  PHOTO_VIDEO = 'PHOTO_VIDEO',
  DRONE = 'DRONE',
  LIVE = 'LIVE',
  EDITING = 'EDITING',
  MEETING = 'MEETING', // rendez-vous client, repérage
  OTHER = 'OTHER',
}

export enum MediaSessionStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

/** Rôle d'un membre de l'équipe sur une séance */
export enum MediaCrewRole {
  PHOTOGRAPHER = 'PHOTOGRAPHER',
  VIDEOGRAPHER = 'VIDEOGRAPHER',
  DRONE_PILOT = 'DRONE_PILOT',
  EDITOR = 'EDITOR', // monteur / retoucheur
  DESIGNER = 'DESIGNER',
  COMMUNITY_MANAGER = 'COMMUNITY_MANAGER',
  DIRECTOR = 'DIRECTOR', // réalisateur
  ASSISTANT = 'ASSISTANT',
  OTHER = 'OTHER',
}

/** Fichier de la médiathèque */
export enum MediaFileType {
  PHOTO = 'PHOTO',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT',
  LINK = 'LINK', // lien externe (Drive, WeTransfer, YouTube…)
}

export enum MediaPaymentMethod {
  CASH = 'CASH',
  MOBILE_MONEY = 'MOBILE_MONEY',
  FPAY = 'FPAY',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CARD = 'CARD',
  OTHER = 'OTHER',
}

/** Historique d'un projet */
export enum MediaEventType {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  ITEMS_UPDATED = 'ITEMS_UPDATED',
  SESSION_PLANNED = 'SESSION_PLANNED',
  SESSION_UPDATED = 'SESSION_UPDATED',
  CREW_ASSIGNED = 'CREW_ASSIGNED',
  CREW_REMOVED = 'CREW_REMOVED',
  EQUIPMENT_BOOKED = 'EQUIPMENT_BOOKED',
  EQUIPMENT_RELEASED = 'EQUIPMENT_RELEASED',
  FILE_ADDED = 'FILE_ADDED',
  PAYMENT = 'PAYMENT',
  SHARED = 'SHARED',
  NOTE = 'NOTE',
  SOCIAL_POST = 'SOCIAL_POST', // publication réseaux sociaux (création, validation, publication)
  SOCIAL_CAMPAIGN = 'SOCIAL_CAMPAIGN',
  VENDOR_ASSIGNED = 'VENDOR_ASSIGNED', // prestataire externe engagé sur le projet
  VENDOR_UPDATED = 'VENDOR_UPDATED', // statut / livraison / évaluation du prestataire
  VENDOR_PAYMENT = 'VENDOR_PAYMENT', // paiement versé au prestataire
}

/** Transitions autorisées du cycle d'un projet */
export const MEDIA_PROJECT_TRANSITIONS: Record<MediaProjectStatus, MediaProjectStatus[]> = {
  [MediaProjectStatus.REQUEST]: [MediaProjectStatus.QUOTED, MediaProjectStatus.CONFIRMED, MediaProjectStatus.CANCELLED],
  [MediaProjectStatus.QUOTED]: [MediaProjectStatus.CONFIRMED, MediaProjectStatus.REQUEST, MediaProjectStatus.CANCELLED],
  [MediaProjectStatus.CONFIRMED]: [MediaProjectStatus.IN_PRODUCTION, MediaProjectStatus.POST_PRODUCTION, MediaProjectStatus.CANCELLED],
  [MediaProjectStatus.IN_PRODUCTION]: [MediaProjectStatus.POST_PRODUCTION, MediaProjectStatus.DELIVERED, MediaProjectStatus.CANCELLED],
  [MediaProjectStatus.POST_PRODUCTION]: [MediaProjectStatus.IN_PRODUCTION, MediaProjectStatus.DELIVERED, MediaProjectStatus.CANCELLED],
  [MediaProjectStatus.DELIVERED]: [MediaProjectStatus.POST_PRODUCTION, MediaProjectStatus.COMPLETED],
  [MediaProjectStatus.COMPLETED]: [],
  [MediaProjectStatus.CANCELLED]: [],
};

// ============================================================
// ✅ PUBLICATIONS (média interne, chiffres saisis par l'admin)
// ============================================================
/** Nature du contenu publié */
export enum MediaContentType {
  PHOTO = 'PHOTO',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  TEXT = 'TEXT',
  DOCUMENT = 'DOCUMENT',
  OTHER = 'OTHER',
}

/** Cycle simple d'une publication */
export enum MediaPublicationStatus {
  DRAFT = 'DRAFT', // en préparation
  PUBLISHED = 'PUBLISHED', // diffusée
  ARCHIVED = 'ARCHIVED', // retirée / terminée
}

// ============================================================
// ✅ PRESTATAIRES EXTERNES (freelances, studios, agences…)
// ============================================================
/** Personne physique (freelance) ou structure (studio, agence, imprimerie…) */
export enum MediaVendorType {
  INDIVIDUAL = 'INDIVIDUAL',
  COMPANY = 'COMPANY',
}

/** ✅ Domaine d'intervention du prestataire (filtre principal de l'annuaire) */
export enum MediaVendorDomain {
  PHOTOGRAPHER = 'PHOTOGRAPHER', // photographe
  VIDEOGRAPHER = 'VIDEOGRAPHER', // vidéaste / cameraman
  DRONE_PILOT = 'DRONE_PILOT', // pilote de drone
  VIDEO_EDITOR = 'VIDEO_EDITOR', // monteur vidéo
  INFOGRAPHIST = 'INFOGRAPHIST', // infographe
  GRAPHIC_DESIGNER = 'GRAPHIC_DESIGNER', // graphiste
  COMMUNICATION_AGENCY = 'COMMUNICATION_AGENCY', // agence de communication
  PRINTER = 'PRINTER', // imprimeur
  WEB_AGENCY = 'WEB_AGENCY', // agence web / digitale
  COMMUNITY_MANAGER = 'COMMUNITY_MANAGER', // gestion des réseaux sociaux
  SOUND = 'SOUND', // son, sonorisation, voix off
  STUDIO = 'STUDIO', // studio photo / vidéo
  EVENT_SERVICES = 'EVENT_SERVICES', // décoration, scène, éclairage
  INFLUENCER = 'INFLUENCER', // influenceur / créateur de contenu
  OTHER = 'OTHER', // autre (préciser dans domainOther)
}

/** Statut du prestataire dans le référentiel */
export enum MediaVendorStatus {
  PROSPECT = 'PROSPECT', // repéré, pas encore agréé
  ACTIVE = 'ACTIVE', // agréé, peut être engagé
  SUSPENDED = 'SUSPENDED', // temporairement écarté
  BLACKLISTED = 'BLACKLISTED', // à ne plus engager
  ARCHIVED = 'ARCHIVED', // ancien prestataire (historique conservé)
}

/** Pièces du dossier prestataire */
export enum MediaVendorDocumentType {
  ID_CARD = 'ID_CARD', // pièce d'identité
  CONTRACT = 'CONTRACT', // contrat-cadre
  NDA = 'NDA', // accord de confidentialité
  TAX_CERTIFICATE = 'TAX_CERTIFICATE', // NIF / RCCM / attestation fiscale
  INSURANCE = 'INSURANCE', // assurance matériel / responsabilité
  INVOICE = 'INVOICE', // facture du prestataire
  PORTFOLIO = 'PORTFOLIO', // book / démo
  OTHER = 'OTHER',
}

/** Cycle d'une mission confiée à un prestataire */
export enum MediaVendorAssignmentStatus {
  PROPOSED = 'PROPOSED', // proposée, en attente de confirmation du prestataire
  CONFIRMED = 'CONFIRMED', // acceptée
  IN_PROGRESS = 'IN_PROGRESS', // en cours
  DELIVERED = 'DELIVERED', // travail rendu, à contrôler
  VALIDATED = 'VALIDATED', // contrôlé et accepté (évaluation possible)
  CANCELLED = 'CANCELLED',
}

/** Transitions autorisées d'une mission */
export const MEDIA_VENDOR_TRANSITIONS: Record<MediaVendorAssignmentStatus, MediaVendorAssignmentStatus[]> = {
  [MediaVendorAssignmentStatus.PROPOSED]: [MediaVendorAssignmentStatus.CONFIRMED, MediaVendorAssignmentStatus.CANCELLED],
  [MediaVendorAssignmentStatus.CONFIRMED]: [MediaVendorAssignmentStatus.IN_PROGRESS, MediaVendorAssignmentStatus.DELIVERED, MediaVendorAssignmentStatus.CANCELLED],
  [MediaVendorAssignmentStatus.IN_PROGRESS]: [MediaVendorAssignmentStatus.DELIVERED, MediaVendorAssignmentStatus.CANCELLED],
  [MediaVendorAssignmentStatus.DELIVERED]: [MediaVendorAssignmentStatus.VALIDATED, MediaVendorAssignmentStatus.IN_PROGRESS],
  [MediaVendorAssignmentStatus.VALIDATED]: [],
  [MediaVendorAssignmentStatus.CANCELLED]: [],
};

/** Missions qui occupent le prestataire (contrôle des chevauchements) */
export const MEDIA_VENDOR_BUSY: MediaVendorAssignmentStatus[] = [
  MediaVendorAssignmentStatus.PROPOSED,
  MediaVendorAssignmentStatus.CONFIRMED,
  MediaVendorAssignmentStatus.IN_PROGRESS,
];
