import { Injectable, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DeviceToken } from 'src/firebase/entities/device-token.entity';

/** Options avancées d'un push (web, Android, iOS) */
export interface FcmPushOptions {
  imageUrl?: string | null;
  /** Lien ouvert au clic (web push) */
  link?: string;
  /** Regroupe les notifications (ex. une conversation) */
  tag?: string;
  /** Canal Android (doit exister côté app mobile) */
  androidChannelId?: string;
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
    const tokens = await this.deviceTokenRepo.find({ where: { userId } });
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

    const tokens = await this.deviceTokenRepo.find({ where: { userId: In(unique) } });
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
}
