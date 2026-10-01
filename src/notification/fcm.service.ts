import { Injectable, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceToken } from 'src/firebase/entities/device-token.entity';

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

  // src/notification/fcm.service.ts
  async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
    imageUrl?: string, // nouveau paramètre
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

    const messages = tokens.map(({ token }) => ({
      token,
      notification: {
        title,
        body,
        ...(imageUrl && { imageUrl }), // Ajout conditionnel
      },
      data: data || {},
    }));

    try {
      const response = await admin.messaging().sendEach(messages);
      console.log(
        ` FCM envoyé à ${userId}: succès=${response.successCount}, échecs=${response.failureCount}`,
      );
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(
            ` Échec pour token ${tokens[idx].token.substring(0, 20)}... : ${resp.error?.code} - ${resp.error?.message}`,
          );
        }
      });
    } catch (error) {
      console.error(' FCM error:', error);
    }
  }
}
