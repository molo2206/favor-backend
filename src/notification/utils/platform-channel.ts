import { NotificationType } from '../type/notification.type';

/**
 * ✅ Canaux de notification, d'après l'en-tête `x-platform` des applications :
 *   - mobile : applications iOS / Android (x-platform: ios | android | mobile)
 *   - web    : site e-commerce (x-platform: web)
 *   - admin  : back-office Favor Help (x-platform: admin)
 *   - group  : back-office Favor Group (x-platform: group)
 *   - driver : application Favor Driver des chauffeurs (x-platform: driver)
 *
 * Chaque notification peut cibler un ou plusieurs canaux. Sans canal = toutes les applications
 * (comportement historique : rien ne change pour les notifications existantes).
 */
export type NotificationChannel = 'mobile' | 'web' | 'admin' | 'group' | 'driver';

export const ALL_CHANNELS: NotificationChannel[] = ['mobile', 'web', 'admin', 'group', 'driver'];

/** Valeur brute (en-tête, appareil, socket) → canal ; null si inconnue */
export function channelOf(raw?: string | null): NotificationChannel | null {
  const p = String(raw ?? '').toLowerCase().trim();
  if (!p) return null;
  if (p === 'ios' || p === 'android' || p === 'mobile') return 'mobile';
  if (p === 'web') return 'web';
  if (p === 'admin') return 'admin';
  if (p === 'group') return 'group';
  if (p === 'driver') return 'driver';
  return null;
}

/** Canal de la requête HTTP (en-tête x-platform / platform / x-platform-type) */
export function channelFromHeaders(headers: Record<string, any> | undefined): NotificationChannel | null {
  if (!headers) return null;
  return channelOf((headers['x-platform'] || headers['platform'] || headers['x-platform-type']) as string);
}

/** Nettoie une liste de canaux ; undefined = toutes les applications */
export function normalizeChannels(channels?: (string | null | undefined)[] | null): NotificationChannel[] | undefined {
  if (!channels?.length) return undefined;
  const list = [...new Set(channels.map((c) => channelOf(c)).filter((c): c is NotificationChannel => !!c))];
  return list.length && list.length < ALL_CHANNELS.length ? list : undefined;
}

/**
 * Un appareil / socket reçoit-il ce message ?
 * - pas de canal ciblé → oui ;
 * - plateforme inconnue (anciens appareils sans x-platform) → oui (rétro-compatibilité) ;
 * - sinon → seulement si son canal est ciblé.
 */
export function channelAccepts(target: NotificationChannel[] | undefined, platform?: string | null): boolean {
  if (!target?.length) return true;
  const ch = channelOf(platform);
  return !ch || target.includes(ch);
}

/** Stockage en base (colonne `channels` : "mobile,web") */
export function channelsToColumn(channels?: NotificationChannel[]): string | null {
  return channels?.length ? channels.join(',') : null;
}

/**
 * Canaux par défaut selon le type de notification (si l'appelant n'en précise pas).
 * Les types absents vont vers toutes les applications.
 */
const DEFAULT_CHANNELS: Partial<Record<NotificationType, NotificationChannel[]>> = {
  // 🚕 Courses : offre au chauffeur = Favor Driver (driver) + anciennes versions qui envoient ios/android (mobile) ;
  //    suivi de la course : passager (mobile, web) et chauffeur (driver)
  //    ✅ l'offre de course (appel) va SEULEMENT dans Favor Driver (plus dans l'application client du chauffeur)
  [NotificationType.NEW_RIDE]: ['driver'],
  [NotificationType.RIDE_ACCEPTED]: ['mobile', 'web', 'driver'],
  [NotificationType.RIDE_CANCELLED]: ['mobile', 'web', 'driver'],
  [NotificationType.RIDE_DRIVER_ARRIVED]: ['mobile', 'web', 'driver'],
  [NotificationType.RIDE_STARTED]: ['mobile', 'web', 'driver'],
  [NotificationType.RIDE_COMPLETED]: ['mobile', 'web', 'driver'],
  [NotificationType.RIDE_NO_DRIVER]: ['mobile', 'web', 'driver'],
  [NotificationType.RIDE_SEARCHING]: ['mobile', 'web', 'driver'],
  [NotificationType.RIDE_PAYMENT]: ['mobile', 'web', 'driver'],
  // 💬 Chat chauffeur ↔ client (le service précise l'application du destinataire)
  [NotificationType.RIDE_CHAT_MESSAGE]: ['mobile', 'web', 'driver'],
  // 🚗 Documents du véhicule (validation par l'admin) : application du chauffeur
  [NotificationType.VEHICLE_KYC]: ['driver'],
  // 💬 Chat interne des employés : back-offices
  [NotificationType.CHAT_MESSAGE]: ['admin', 'group'],
  [NotificationType.CHAT_MENTION]: ['admin', 'group'],
  [NotificationType.CHAT_REPLY]: ['admin', 'group'],
  [NotificationType.CHAT_REACTION]: ['admin', 'group'],
  [NotificationType.CHAT_GROUP_ADDED]: ['admin', 'group'],
  [NotificationType.CHAT_GROUP_REMOVED]: ['admin', 'group'],
  // 🏢 BackOffice : média, logistique interne
  [NotificationType.MEDIA_ASSIGNMENT]: ['admin', 'group', 'mobile'],
  [NotificationType.MEDIA_PROJECT_UPDATE]: ['admin', 'group', 'mobile'],
};

export function defaultChannelsFor(type?: string | null): NotificationChannel[] | undefined {
  if (!type) return undefined;
  return DEFAULT_CHANNELS[type as NotificationType];
}

/**
 * ✅ Variables d'environnement pour ajuster sans redéployer le code :
 *   NOTIFICATION_CHANNELS_<TYPE>=mobile,web   (ex. NOTIFICATION_CHANNELS_NEW_RIDE=mobile)
 *   NOTIFICATION_CHANNELS_<TYPE>=all          (toutes les applications)
 */
export function resolveChannels(type?: string | null, explicit?: (string | null | undefined)[] | null): NotificationChannel[] | undefined {
  if (explicit?.length) return normalizeChannels(explicit);
  if (type) {
    const env = process.env[`NOTIFICATION_CHANNELS_${String(type).toUpperCase()}`];
    if (env !== undefined) {
      if (env.trim().toLowerCase() === 'all' || !env.trim()) return undefined;
      return normalizeChannels(env.split(','));
    }
  }
  return defaultChannelsFor(type);
}
