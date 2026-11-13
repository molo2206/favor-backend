import { QUEUES } from '@favor/contracts';
import { bootstrapRmqService } from '@favor/rpc';
import { PaymentMethodsServiceModule } from './payment-methods-service.module';

/** ✅ Microservice « moyens de paiement des utilisateurs » (Mobile Money, FPay, Cash) — RabbitMQ + Prisma */
bootstrapRmqService(PaymentMethodsServiceModule, QUEUES.PAYMENT_METHODS, 'PaymentMethodsService').catch((e) => {
  console.error('Échec du démarrage du service moyens de paiement :', e?.message ?? e);
  process.exit(1);
});
