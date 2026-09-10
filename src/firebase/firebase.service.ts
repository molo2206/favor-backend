// firebase/firebase.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { app } from 'firebase-admin';

@Injectable()
export class FirebaseService {
  constructor(
    @Inject('FIREBASE_ADMIN') private readonly firebaseApp: app.App,
    private readonly configService: ConfigService,
  ) {}

  async sendPushNotification(
    deviceToken: string,
    payload: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ) {
    try {
      const message: {
        token: string;
        notification: { title: string; body: string };
        data?: Record<string, string>;
        android?: { priority: 'high' | 'normal' };
        apns?: { payload: { aps: { sound: string } } };
      } = {
        token: deviceToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
        android: {
          priority: 'high' as const, // ← 'as const' pour le type littéral
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      };

      const response = await this.firebaseApp.messaging().send(message);
      console.log('Notification push envoyée:', response);
      return response;
    } catch (error) {
      console.error('Erreur d\'envoi de notification push:', error);
      throw error;
    }
  }

  async sendMulticastNotification(
    deviceTokens: string[],
    payload: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ) {
    try {
      const message: {
        tokens: string[];
        notification: { title: string; body: string };
        data?: Record<string, string>;
        android?: { priority: 'high' | 'normal' };
        apns?: { payload: { aps: { sound: string } } };
      } = {
        tokens: deviceTokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
        android: {
          priority: 'high' as const,
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      };

      const response = await this.firebaseApp.messaging().sendEachForMulticast(message);
      console.log(`${response.successCount} notifications envoyées avec succès`);
      
      // Gérer les tokens invalides
      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(deviceTokens[idx]);
          }
        });
        console.log('Tokens invalides:', failedTokens);
      }

      return response;
    } catch (error) {
      console.error('Erreur d\'envoi multicast:', error);
      throw error;
    }
  }
}