import { QUEUES } from '@favor/contracts';
import { bootstrapRmqService } from '@favor/rpc';
import { SettingsServiceModule } from './settings-service.module';

/** ✅ Microservice « paramètres de l'application » (lecture publique GET /app-setting) — RabbitMQ + Prisma */
bootstrapRmqService(SettingsServiceModule, QUEUES.SETTINGS, 'SettingsService').catch((e) => {
  console.error('Échec du démarrage du service paramètres :', e?.message ?? e);
  process.exit(1);
});
