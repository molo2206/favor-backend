import { Injectable, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DeviceToken } from 'src/firebase/entities/device-token.entity';
import { channelAccepts, NotificationChannel, normalizeChannels } from './utils/platform-channel';
import { ApnsVoipClient } from './apns-voip.client';
import { randomUUID } from 'crypto';

/** Options avancées d'un push (web, Android, iOS) */
export interface FcmPushOptions {
  imageUrl?: string | null;
  /** Lien ouvert au clic (web push) */
  link?: string;
  /** Regroupe les notifications (ex. une conversation) */
  tag?: string;
  /** Canal Android (doit exister côté app mobile) */
  androidChannelId?: string;
  /**
   * ✅ Applications ciblées (d'après la plateforme de l'appareil : ios/android = mobile, web, admin, group).
   * Absent = tous les appareils.
   */
  channels?: (NotificationChannel | string)[];
}

/**
 * ✅ Push « appel entrant » (ex. nouvelle course taxi) : l'app affiche un écran d'appel
 * plein écran qui sonne, avec Accepter / Refuser.
 */
export interface FcmCallOptions {
  /** Identifiant de l'appel (ex. rideId) : sert à arrêter la sonnerie ensuite */
  callId: string;
  /** Durée de la sonnerie / validité de l'offre (secondes) */
  ttlSeconds: number;
  /** Canal Android « appels » (importance max + sonnerie) — doit exister côté app */
  androidChannelId?: string;
  /** Son iOS (fichier présent dans l'app, ex. ride_ringtone.caf) */
  iosSound?: string;
  /** Catégorie iOS (boutons Accepter / Refuser) */
  iosCategory?: string;
  /** ✅ Applications ciblées (ex. ['mobile'] : seulement l'application du chauffeur) */
  channels?: (NotificationChannel | string)[];
  /**
   * ✅ Android : nom du son de sonnerie (fichier res/raw de l'app, sans extension, ex. ride_ringtone).
   * Utilisé par la notification système de secours (CALL_ANDROID_SYSTEM_NOTIFICATION=true).
   */
  androidSound?: string;
  /**
   * ✅ Volume de la sonnerie (0 à 100 % du volume « Sonnerie » du téléphone). Par défaut :
   * RIDE_CALL_RING_VOLUME / ORDER_CALL_RING_VOLUME / CALL_RING_VOLUME, sinon 100.
   */
  ringVolume?: number | string;
  /** ✅ true = sonner aussi en mode vibreur / silencieux (RIDE_CALL_RING_FORCE / ORDER_CALL_RING_FORCE / CALL_RING_FORCE) */
  ringForce?: boolean | string;
}

/** Codes FCM indiquant un token définitivement invalide */
const INVALID_TOKEN_CODES = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
];

@Injectable()
export class FcmService implements OnModuleInit {
  constructor(
    private configService: ConfigService,
    @InjectRepository(DeviceToken)
    private deviceTokenRepo: Repository<DeviceToken>,
  ) { }

  onModuleInit() {
    if (!admin.apps.length) {
      const serviceAccount = {
        projectId: this.configService.get('FIREBASE_PROJECT_ID'),
        clientEmail: this.configService.get('FIREBASE_CLIENT_EMAIL'),
        privateKey: this.configService
          .get('FIREBASE_PRIVATE_KEY')
          ?.replace(/\\n/g, '\n'),
      };
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('Firebase Admin initialized');
    }
  }

  /** FCM exige des valeurs string dans `data` */
  private toStringData(data?: Record<string, any>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data ?? {})) {
      if (v === undefined || v === null) continue;
      out[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return out;
  }

  /** ✅ Garde les appareils des applications ciblées (appareils sans plateforme : gardés, rétro-compatibilité) */
  private filterByChannels(tokens: DeviceToken[], channels?: (NotificationChannel | string)[]): DeviceToken[] {
    const target = normalizeChannels(channels);
    if (!target) return tokens;
    return tokens.filter((t) => channelAccepts(target, t.platform));
  }

  /** Supprime les tokens que Firebase déclare invalides */
  private async cleanupInvalidTokens(tokens: string[]) {
    if (!tokens.length) return;
    try {
      await this.deviceTokenRepo.delete({ token: In(tokens) });
      console.log(`🧹 ${tokens.length} token(s) FCM invalide(s) supprimé(s)`);
    } catch (e) {
      console.error('Nettoyage tokens FCM impossible:', e);
    }
  }

  private buildMessage(
    token: string,
    title: string,
    body: string,
    data: Record<string, string>,
    options?: FcmPushOptions,
  ): admin.messaging.Message {
    const imageUrl = options?.imageUrl || undefined;
    return {
      token,
      notification: {
        title,
        body,
        ...(imageUrl && { imageUrl }),
      },
      data,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          ...(options?.androidChannelId && { channelId: options.androidChannelId }),
          ...(options?.tag && { tag: options.tag }),
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            ...(options?.tag && { threadId: options.tag }),
          },
        },
      },
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          title,
          body,
          icon: this.configService.get<string>('PUSH_WEB_ICON') || '/icons/icon-192x192.png',
          badge: this.configService.get<string>('PUSH_WEB_BADGE') || '/icons/badge-72x72.png',
          ...(imageUrl && { image: imageUrl }),
          ...(options?.tag && { tag: options.tag, renotify: true }),
        },
        ...(options?.link && { fcmOptions: { link: options.link } }),
      },
    };
  }

  // src/notification/fcm.service.ts
  async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
    imageUrl?: string, // nouveau paramètre
    options?: FcmPushOptions,
  ) {
    const tokens = this.filterByChannels(await this.deviceTokenRepo.find({ where: { userId } }), options?.channels);
    if (!tokens.length) {
      console.log(`Aucun token FCM pour l'utilisateur ${userId}`);
      return;
    }

    console.log(` Envoi push à ${userId} avec ${tokens.length} token(s)`);
    tokens.forEach((t) =>
      console.log(`   token: ${t.token.substring(0, 30)}...`),
    );

    const stringData = this.toStringData(data);
    const messages = tokens.map(({ token }) =>
      this.buildMessage(token, title, body, stringData, {
        ...options,
        imageUrl: imageUrl ?? options?.imageUrl,
      }),
    );

    try {
      const response = await admin.messaging().sendEach(messages);
      console.log(
        ` FCM envoyé à ${userId}: succès=${response.successCount}, échecs=${response.failureCount}`,
      );
      const invalid: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(
            ` Échec pour token ${tokens[idx].token.substring(0, 20)}... : ${resp.error?.code} - ${resp.error?.message}`,
          );
          if (resp.error && INVALID_TOKEN_CODES.includes(resp.error.code)) {
            invalid.push(tokens[idx].token);
          }
        }
      });
      await this.cleanupInvalidTokens(invalid);
    } catch (error) {
      console.error(' FCM error:', error);
    }
  }

  /**
   * Push vers plusieurs utilisateurs (tous leurs appareils).
   * Retourne la liste des userIds atteints au moins une fois.
   */
  async sendPushToUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, any>,
    options?: FcmPushOptions,
  ): Promise<string[]> {
    const unique = [...new Set((userIds || []).filter(Boolean))];
    if (!unique.length) return [];

    const tokens = this.filterByChannels(await this.deviceTokenRepo.find({ where: { userId: In(unique) } }), options?.channels);
    if (!tokens.length) return [];

    const stringData = this.toStringData(data);
    const reached = new Set<string>();
    const invalid: string[] = [];

    // sendEach : 500 messages maximum par appel
    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500);
      try {
        const response = await admin
          .messaging()
          .sendEach(chunk.map((t) => this.buildMessage(t.token, title, body, stringData, options)));
        response.responses.forEach((resp, idx) => {
          if (resp.success) reached.add(chunk[idx].userId);
          else if (resp.error && INVALID_TOKEN_CODES.includes(resp.error.code)) {
            invalid.push(chunk[idx].token);
          }
        });
        console.log(
          ` FCM multi-utilisateurs : succès=${response.successCount}, échecs=${response.failureCount}`,
        );
      } catch (error) {
        console.error(' FCM error (multi):', error);
      }
    }

    await this.cleanupInvalidTokens(invalid);
    return [...reached];
  }

  // ============================================================
  // ✅ APPEL ENTRANT (course taxi…)
  // ============================================================
  /**
   * Message « appel » :
   *  - Android : message DATA uniquement, priorité haute, durée de vie = sonnerie.
   *    L'app (handler FCM en arrière-plan) affiche l'écran d'appel plein écran (full-screen intent / CallKeep).
   *  - iOS : alerte « time-sensitive », sonnerie, catégorie avec boutons Accepter / Refuser.
   *  - Web : notification qui reste affichée avec actions.
   */
  /** Lien web ouvert au clic sur un appel : PUSH_WEB_CALL_LINK_RIDE / _ORDER (ex. https://admin.favorhelp.com/orders/{orderId}) */
  private webCallLink(data: Record<string, string>): string | undefined {
    if (data.link && /^https:\/\//.test(data.link)) return data.link;
    const category = String(data.category || '').toUpperCase();
    const tpl = (category && this.configService.get<string>(`PUSH_WEB_CALL_LINK_${category}`)) || this.configService.get<string>('PUSH_WEB_CALL_LINK');
    if (!tpl) return undefined;
    const url = tpl.replace(/\{(\w+)\}/g, (_m, k) => encodeURIComponent(data[k] ?? ''));
    return /^https:\/\//.test(url) ? url : undefined;
  }

  private buildCallMessage(
    token: string,
    platform: string | null | undefined,
    title: string,
    body: string,
    data: Record<string, string>,
    options: FcmCallOptions,
  ): admin.messaging.Message {
    const ttlMs = Math.max(1, options.ttlSeconds) * 1000;
    const expiration = Math.floor(Date.now() / 1000) + Math.max(1, options.ttlSeconds);
    const callData: Record<string, string> = {
      ...data,
      notificationStyle: 'call',
      callId: options.callId,
      title,
      body,
      ringSeconds: String(options.ttlSeconds),
      expiresAt: data.expiresAt ?? new Date(Date.now() + ttlMs).toISOString(),
      ...(options.androidChannelId ? { androidChannelId: options.androidChannelId } : {}),
    };
    const p = String(platform || '').toLowerCase();

    // ✅ WEB (back-office admin / group, site) : notification qui reste à l'écran jusqu'au clic,
    // vibration, son système, boutons Accepter / Refuser, clic → page de l'appel (PUSH_WEB_CALL_LINK_<CATÉGORIE>).
    // Reçue même onglet fermé tant que le navigateur tourne (service worker firebase-messaging-sw.js).
    if (p === 'web' || p === 'admin' || p === 'group') {
      const link = this.webCallLink(callData);
      return {
        token,
        data: callData,
        webpush: {
          headers: { Urgency: 'high', TTL: String(options.ttlSeconds) },
          notification: {
            title,
            body,
            icon: this.configService.get<string>('PUSH_WEB_ICON') || '/icons/icon-192x192.png',
            badge: this.configService.get<string>('PUSH_WEB_BADGE') || '/icons/badge-72x72.png',
            tag: `call-${options.callId}`,
            renotify: true,
            requireInteraction: true,
            silent: false,
            vibrate: [600, 300, 600, 300, 600, 300, 600],
            timestamp: Date.now(),
            data: callData,
            actions: [
              { action: 'accept', title: 'Accepter' },
              { action: 'decline', title: 'Refuser' },
            ],
          } as any,
          ...(link ? { fcmOptions: { link } } : {}),
        },
      };
    }

    // ✅ ANDROID
    //  - par défaut : message DATA seul, priorité haute → l'app est réveillée même fermée et affiche
    //    elle-même l'écran d'appel plein écran (Notifee fullScreenAction, canal androidChannelId) ;
    //  - CALL_ANDROID_SYSTEM_NOTIFICATION=true : ajoute une notification système qui sonne (canal + son)
    //    affichée par Android même si l'app ne démarre pas (téléphones Tecno / Infinix / Xiaomi qui bloquent
    //    les apps en arrière-plan). L'app doit alors ne pas doubler l'affichage (même tag call-<callId>).
    const androidSystem = String(this.configService.get('CALL_ANDROID_SYSTEM_NOTIFICATION') ?? 'false').toLowerCase() === 'true';
    const androidNotification = androidSystem
      ? {
        title,
        body,
        channelId: options.androidChannelId || 'calls',
        sound: options.androidSound || 'default',
        priority: 'max' as const,
        visibility: 'public' as const,
        tag: `call-${options.callId}`,
        defaultVibrateTimings: false,
        vibrateTimingsMillis: [0, 800, 400, 800, 400, 800],
        sticky: false,
        localOnly: true,
        clickAction: 'INCOMING_CALL',
      }
      : undefined;

    return {
      token,
      // ⚠️ Par défaut pas de bloc `notification` : l'app reçoit le message même en arrière-plan / fermée
      data: callData,
      android: {
        priority: 'high',
        ttl: ttlMs,
        collapseKey: `call-${options.callId}`,
        directBootOk: true,
        ...(androidNotification ? { notification: androidNotification } : {}),
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
          'apns-expiration': String(expiration),
          'apns-collapse-id': `call-${options.callId}`.slice(0, 64),
        },
        payload: {
          aps: {
            alert: { title, body },
            sound: { name: options.iosSound || 'default', critical: false, volume: 1 },
            category: options.iosCategory || 'RIDE_CALL',
            'interruption-level': 'time-sensitive',
            'relevance-score': 1,
            'content-available': 1,
            'mutable-content': 1,
            'thread-id': `call-${options.callId}`,
          } as any,
        },
      },
    };
  }

  /**
   * ✅ Volume de la sonnerie d'appel envoyé aux applications :
   *  - options.ringVolume, sinon RIDE_CALL_RING_VOLUME (courses) / ORDER_CALL_RING_VOLUME (commandes),
   *    sinon CALL_RING_VOLUME, sinon 100 (volume maximal). 0 = ne pas toucher au volume du téléphone.
   *  - options.ringForce, sinon RIDE_CALL_RING_FORCE / ORDER_CALL_RING_FORCE / CALL_RING_FORCE (false) :
   *    true = sonner même quand le téléphone est en mode vibreur / silencieux.
   * Android : l'application monte le volume « Sonnerie » pendant l'appel puis le remet.
   * iPhone : CallKit utilise toujours le volume de sonnerie réglé sur le téléphone (Apple ne permet pas
   * à une application de le changer).
   */
  private ringSettings(data: Record<string, any>, options: FcmCallOptions): { ringVolume: string; ringForce: string } {
    const cat = String(data?.category || '').toLowerCase() === 'order' ? 'ORDER' : 'RIDE';
    const pick = (key: string) =>
      this.configService.get<string>(`${cat}_CALL_${key}`) ?? this.configService.get<string>(`CALL_${key}`);
    const rawVol = options.ringVolume ?? pick('RING_VOLUME') ?? 100;
    const vol = Number(rawVol);
    const ringVolume = Number.isFinite(vol) ? Math.min(100, Math.max(0, Math.round(vol))) : 100;
    const rawForce = options.ringForce ?? pick('RING_FORCE') ?? false;
    const ringForce = String(rawForce).toLowerCase() === 'true';
    return { ringVolume: String(ringVolume), ringForce: String(ringForce) };
  }

  /**
   * ✅ Envoie un « appel entrant » à plusieurs utilisateurs (tous leurs appareils).
   * Retourne les userIds atteints au moins une fois.
   */
  async sendCallToUsers(
    userIds: string[],
    title: string,
    body: string,
    data: Record<string, any>,
    options: FcmCallOptions,
  ): Promise<string[]> {
    const unique = [...new Set((userIds || []).filter(Boolean))];
    if (!unique.length) return [];
    // ✅ Appel : seulement les applications ciblées (par défaut tous les appareils de l'utilisateur)
    const tokens = this.filterByChannels(await this.deviceTokenRepo.find({ where: { userId: In(unique) } }), options.channels);
    if (!tokens.length) return [];
    // ✅ Volume de la sonnerie (Android) : ringVolume 0-100 % + ringForce (sonner en mode vibreur / silencieux)
    const stringData = this.toStringData({ ...data, ...this.ringSettings(data, options) });
    const reached = new Set<string>();
    const invalid: string[] = [];

    // ✅ iPhone avec jeton VoIP : appel natif (CallKit) via Apple ; repli sur Firebase si l'envoi échoue
    const voip = ApnsVoipClient.shared(this.configService);
    let fcmTokens = tokens;
    if (voip.enabled) {
      // ✅ Sujet VoIP selon l'application de l'appareil (Favor Driver, appli livreur…) : APNS_VOIP_TOPICS
      const voipTargets = tokens.filter((t) => !!t.voipToken && !!voip.topicFor(t.platform));
      const failed = new Set<string>();
      const deadVoip: string[] = [];
      await Promise.all(
        voipTargets.map(async (t) => {
          // ✅ Données lues par l'app iOS (PushKit → CallKit) :
          //    uuid = identifiant de l'appel CallKit (obligatoire), callerName = nom affiché, handle = sous-titre.
          const r = await voip.send(
            t.voipToken!,
            {
              ...stringData,
              aps: {},
              notificationStyle: 'call',
              uuid: randomUUID(),
              callId: options.callId,
              callerName: title,
              handle: body,
              hasVideo: false,
              title,
              body,
              ringSeconds: String(options.ttlSeconds),
              expiresAt: new Date(Date.now() + options.ttlSeconds * 1000).toISOString(),
            },
            { ttlSeconds: options.ttlSeconds, collapseId: `call-${options.callId}`, topic: voip.topicFor(t.platform) },
          );
          if (r.ok) reached.add(t.userId);
          else {
            failed.add(t.token);
            if (r.invalidToken) deadVoip.push(t.voipToken!);
            console.warn(` VoIP appel ${options.callId} → ${t.userId} : ${r.status} ${r.reason ?? ''}`);
          }
        }),
      );
      if (voipTargets.length) console.log(` VoIP appel ${options.callId} : succès=${voipTargets.length - failed.size}, échecs=${failed.size}`);
      if (deadVoip.length) await this.deviceTokenRepo.update({ voipToken: In(deadVoip) }, { voipToken: null }).catch(() => undefined);
      const viaVoip = new Set(voipTargets.map((t) => t.token));
      fcmTokens = tokens.filter((t) => !viaVoip.has(t.token) || failed.has(t.token));
    }

    for (let i = 0; i < fcmTokens.length; i += 500) {
      const chunk = fcmTokens.slice(i, i + 500);
      try {
        const response = await admin
          .messaging()
          .sendEach(chunk.map((t) => this.buildCallMessage(t.token, t.platform, title, body, stringData, options)));
        response.responses.forEach((resp, idx) => {
          if (resp.success) reached.add(chunk[idx].userId);
          else if (resp.error && INVALID_TOKEN_CODES.includes(resp.error.code)) invalid.push(chunk[idx].token);
        });
        console.log(` FCM appel ${options.callId} : succès=${response.successCount}, échecs=${response.failureCount}`);
      } catch (error) {
        console.error(' FCM error (appel):', error);
      }
    }
    await this.cleanupInvalidTokens(invalid);
    return [...reached];
  }

  /**
   * ✅ Arrête la sonnerie sur les appareils (offre prise par un autre chauffeur, annulée, expirée…).
   * Message DATA silencieux : l'app ferme l'écran d'appel et retire la notification.
   */
  async cancelCallForUsers(
    userIds: string[],
    callId: string,
    reason: string,
    data: Record<string, any> = {},
    channels?: (NotificationChannel | string)[],
    /** noVoipUserIds : utilisateurs qui reçoivent la fin d'appel par Firebase seulement (pas de push VoIP → pas d'écran d'appel iOS) */
    opts: { noVoipUserIds?: string[] } = {},
  ): Promise<void> {
    const unique = [...new Set((userIds || []).filter(Boolean))];
    if (!unique.length) return;
    const tokens = this.filterByChannels(await this.deviceTokenRepo.find({ where: { userId: In(unique) } }), channels);
    if (!tokens.length) return;
    const noVoip = new Set((opts.noVoipUserIds || []).filter(Boolean));
    const payload = this.toStringData({ ...data, notificationStyle: 'call_cancel', callId, reason });
    const invalid: string[] = [];

    // ✅ iPhone (CallKit) : push VoIP « call_cancel » → l'écran d'appel natif se ferme même application fermée
    //    (un push Firebase silencieux n'arrive pas quand l'application est fermée).
    const voip = ApnsVoipClient.shared(this.configService);
    const voipCancel = String(this.configService.get('APNS_VOIP_CANCEL') ?? 'true').toLowerCase() !== 'false';
    // Refus par le chauffeur lui-même : l'appel est déjà terminé sur son iPhone (pas de nouvel écran d'appel)
    if (voip.enabled && voipCancel && String(reason).toUpperCase() !== 'REJECTED') {
      const targets = tokens.filter((t) => !!t.voipToken && !!voip.topicFor(t.platform) && !noVoip.has(t.userId));
      await Promise.all(
        targets.map(async (t) => {
          const r = await voip.send(
            t.voipToken!,
            { ...payload, aps: {}, title: payload.title || 'Favor Driver' },
            { ttlSeconds: 60, collapseId: `call-${callId}`, topic: voip.topicFor(t.platform) },
          );
          if (!r.ok) console.warn(` VoIP fin d'appel ${callId} → ${t.userId} : ${r.status} ${r.reason ?? ''}`);
        }),
      );
    }
    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500);
      try {
        const response = await admin.messaging().sendEach(
          chunk.map((t) => ({
            token: t.token,
            data: payload,
            android: { priority: 'high' as const, ttl: 60 * 1000, collapseKey: `call-${callId}` },
            apns: {
              headers: { 'apns-priority': '5', 'apns-push-type': 'background', 'apns-collapse-id': `call-${callId}`.slice(0, 64) },
              payload: { aps: { 'content-available': 1 } as any },
            },
          })),
        );
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error && INVALID_TOKEN_CODES.includes(resp.error.code)) invalid.push(chunk[idx].token);
        });
      } catch (error) {
        console.error(' FCM error (fin d\'appel):', error);
      }
    }
    await this.cleanupInvalidTokens(invalid);
  }
}
