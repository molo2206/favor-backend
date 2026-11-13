// firebase/firebase.module.ts
import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { FirebaseService } from './firebase.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'FIREBASE_ADMIN',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        if (!admin.apps.length) {
          const projectId = configService.get<string>('FIREBASE_PROJECT_ID');
          const clientEmail = configService.get<string>('FIREBASE_CLIENT_EMAIL');
          const privateKey = configService.get<string>('FIREBASE_PRIVATE_KEY');

          console.log('🔍 Firebase config:', {
            projectId: !!projectId,
            clientEmail: !!clientEmail,
            privateKeyLength: privateKey?.length,
          });

          if (!projectId || !clientEmail || !privateKey) {
            throw new Error(
              `Firebase credentials manquants. projectId=${!!projectId}, clientEmail=${!!clientEmail}, privateKey=${privateKey?.length}`,
            );
          }

          admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey: privateKey.replace(/\\n/g, '\n'),
            } as admin.ServiceAccount),
          });

          console.log('✅ Firebase Admin initialized');
        }

        return admin.app();
      },
    },
    FirebaseService,
  ],
  exports: ['FIREBASE_ADMIN', FirebaseService],
})
export class FirebaseModule {}