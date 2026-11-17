import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FcmService } from 'src/notification/fcm.service';

/**
 * ✅ Nouvelle commande → notification Firebase sous forme d'APPEL (comme les courses taxi) :
 *  - Android : push data-only priorité haute → écran d'appel plein écran + sonnerie (canal ORDER_CALL_ANDROID_CHANNEL_ID) ;
 *  - iOS     : notification « time-sensitive » avec sonnerie (ORDER_CALL_IOS_SOUND), catégorie ORDER_CALL ;
 *  - Web     : notification persistante (requireInteraction).
 * La sonnerie s'arrête quand la commande est prise en charge (statut, frais de livraison,
 * validation / paiement, annulation) ou après ORDER_CALL_RING_SECONDS.
 *
 * Variables .env (toutes facultatives) :
 *   ORDER_CALL_PUSH=true                    false = push classique comme avant
 *   ORDER_CALL_RING_SECONDS=45
 *   ORDER_CALL_ANDROID_CHANNEL_ID=order_calls
 *   ORDER_CALL_IOS_SOUND=order_ringtone.caf
 *   ORDER_CALL_ADMINS=true                  admins de la ville (ressource commandes)
 *   ORDER_CALL_SUPER_ADMINS=false           super admins (toutes les villes)
 */
@Injectable()
export class OrderCallService {
  private readonly logger = new Logger(OrderCallService.name);
  /** commande → utilisateurs qui sonnent + fin de la sonnerie (pour arrêter la sonnerie) */
  private readonly ringing = new Map<string, { userIds: Set<string>; timer: NodeJS.Timeout; endsAt: number }>();

  constructor(
    @Inject(forwardRef(() => FcmService))
    private readonly fcm: FcmService,
    private readonly config: ConfigService,
  ) { }

  private flag(name: string, def: boolean): boolean {
    const v = this.config.get<string>(name);
    if (v === undefined || v === null || v === '') return def;
    return String(v).toLowerCase() === 'true';
  }

  get enabled(): boolean {
    return this.flag('ORDER_CALL_PUSH', true);
  }

  /** Admins de la ville : appel aussi ? */
  get ringAdmins(): boolean {
    return this.enabled && this.flag('ORDER_CALL_ADMINS', true);
  }

  /** Super admins (toutes les commandes) : appel aussi ? */
  get ringSuperAdmins(): boolean {
    return this.enabled && this.flag('ORDER_CALL_SUPER_ADMINS', false);
  }

  private get ringSeconds(): number {
    const n = Number(this.config.get('ORDER_CALL_RING_SECONDS') ?? 45);
    return Number.isFinite(n) && n >= 10 ? Math.min(n, 120) : 45;
  }

  private callId(orderId: string) {
    return `order-${orderId}`;
  }

  /**
   * Fait sonner les appareils de ces utilisateurs.
   * Renvoie les utilisateurs effectivement joints (au moins un appareil) : les autres
   * doivent recevoir le push classique.
   */
  async ring(
    userIds: string[],
    orderId: string,
    title: string,
    body: string,
    data: Record<string, any> = {},
    imageUrl?: string,
  ): Promise<string[]> {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!this.enabled || !ids.length || !orderId) return [];
    try {
      const reached = await this.fcm.sendCallToUsers(
        ids,
        title,
        body,
        {
          ...data,
          category: 'order',
          entity: 'ORDER',
          entityId: orderId,
          orderId,
          type: 'order_call',
          ...(imageUrl ? { imageUrl } : {}),
        },
        {
          callId: this.callId(orderId),
          ttlSeconds: this.ringSeconds,
          androidChannelId: this.config.get<string>('ORDER_CALL_ANDROID_CHANNEL_ID') || 'order_calls',
          iosSound: this.config.get<string>('ORDER_CALL_IOS_SOUND') || 'order_ringtone.caf',
          // ✅ Android : sonnerie de la notification système de secours (res/raw/order_ringtone)
          androidSound: this.config.get<string>('ORDER_CALL_ANDROID_SOUND') || 'order_ringtone',
          iosCategory: 'ORDER_CALL',
        },
      );
      if (reached.length) this.remember(orderId, reached);
      return reached;
    } catch (e: any) {
      this.logger.warn(`Appel commande ${orderId} impossible : ${e?.message}`);
      return [];
    }
  }

  private remember(orderId: string, userIds: string[]) {
    const current = this.ringing.get(orderId);
    if (current) clearTimeout(current.timer);
    const set = current?.userIds ?? new Set<string>();
    userIds.forEach((id) => set.add(id));
    // Fin de sonnerie côté appareil après ringSeconds : on oublie la commande un peu après
    const timer = setTimeout(() => this.ringing.delete(orderId), (this.ringSeconds + 15) * 1000);
    if (typeof (timer as any).unref === 'function') (timer as any).unref();
    this.ringing.set(orderId, { userIds: set, timer, endsAt: Date.now() + this.ringSeconds * 1000 });
  }

  /**
   * Arrête la sonnerie sur tous les appareils (commande prise en charge / annulée) — ne lève jamais d'erreur.
   *
   * ⚠️ Sur iPhone, la fin d'appel passe par un push VoIP, et iOS oblige l'application à AFFICHER un appel
   *    pour chaque push VoIP reçu. Donc :
   *    - sonnerie déjà terminée (appel manqué) → aucun envoi : rien ne sonne plus, et un push VoIP
   *      relancerait un écran d'appel quand le livreur récupère la commande plus tard ;
   *    - `actorId` (celui qui prend / traite / annule la commande) : il est déjà dans l'application,
   *      il reçoit seulement la fin d'appel Firebase (pas de push VoIP → pas d'écran d'appel).
   */
  stop(orderId: string, reason: 'HANDLED' | 'CANCELLED' | 'PAID' = 'HANDLED', actorId?: string | null): void {
    const entry = orderId ? this.ringing.get(orderId) : undefined;
    if (!entry) return;
    clearTimeout(entry.timer);
    this.ringing.delete(orderId);
    if (Date.now() >= entry.endsAt) return; // appel déjà terminé sur les téléphones (manqué) : rien à arrêter
    this.fcm
      .cancelCallForUsers(
        [...entry.userIds],
        this.callId(orderId),
        reason,
        { category: 'order', orderId, type: 'order_call_cancel' },
        undefined,
        { noVoipUserIds: actorId ? [actorId] : [] },
      )
      .catch((e: any) => this.logger.warn(`Arrêt appel commande ${orderId} : ${e?.message}`));
  }
}
