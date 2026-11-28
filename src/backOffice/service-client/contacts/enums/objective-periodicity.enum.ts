/** Périodicité d'un objectif de contact du service client */
export enum ObjectivePeriodicity {
  ONCE = 'ONCE', // objectif unique (pas de réinitialisation)
  DAILY = 'DAILY', // chaque jour
  WEEKLY = 'WEEKLY', // chaque semaine (ISO)
  MONTHLY = 'MONTHLY', // chaque mois
}
