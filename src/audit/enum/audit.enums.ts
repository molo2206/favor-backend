/** ✅ Domaine de l'opération */
export enum AuditCategory {
  SECURITY = 'SECURITY', // connexions, mots de passe, rôles, permissions, comptes
  ADMIN = 'ADMIN', // paramètres, sauvegardes, référentiels
  FINANCE = 'FINANCE', // paiements, F-Pay, trésorerie, paie, décaissements
  BUSINESS = 'BUSINESS', // commandes, colis, courses, produits, logistique…
  TECHNICAL = 'TECHNICAL', // fichiers, notifications, erreurs serveur
}

export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

/** Résultat de l'opération */
export enum AuditStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE', // erreur (4xx hors refus, 5xx)
  DENIED = 'DENIED', // 401 / 403 : non connecté ou non autorisé
}
