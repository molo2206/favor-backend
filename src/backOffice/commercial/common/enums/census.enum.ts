/** ✅ Recensement : type de fiche */
export enum CensusType {
    CLIENT = 'CLIENT',
    VENDOR = 'VENDOR',
}

/** Suivi de la relance */
export enum CensusStatus {
    /** À relancer (nouvelle fiche) */
    TO_CONTACT = 'TO_CONTACT',
    /** Contacté, en cours */
    CONTACTED = 'CONTACTED',
    /** Intéressé par un retour */
    INTERESTED = 'INTERESTED',
    /** Pas intéressé */
    NOT_INTERESTED = 'NOT_INTERESTED',
    /** Injoignable */
    UNREACHABLE = 'UNREACHABLE',
    /** Revenu : a de nouveau commandé / vendu */
    REACTIVATED = 'REACTIVATED',
}

/** Origine de la fiche */
export enum CensusSource {
    /** Saisie sur le terrain */
    FIELD = 'FIELD',
    /** Saisie au téléphone */
    PHONE = 'PHONE',
    /** Créée depuis les anciens clients / vendeurs de la plateforme */
    PLATFORM = 'PLATFORM',
}

/** Canal d'une relance */
export enum CensusChannel {
    CALL = 'CALL',
    SMS = 'SMS',
    WHATSAPP = 'WHATSAPP',
    VISIT = 'VISIT',
    EMAIL = 'EMAIL',
}

/** Résultat d'une relance */
export enum CensusResult {
    REACHED = 'REACHED',
    NOT_REACHED = 'NOT_REACHED',
    CALL_BACK = 'CALL_BACK',
    INTERESTED = 'INTERESTED',
    NOT_INTERESTED = 'NOT_INTERESTED',
    REACTIVATED = 'REACTIVATED',
}
