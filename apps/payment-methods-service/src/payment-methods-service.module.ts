import { Module } from '@nestjs/common';
import { DatabaseModule } from '@favor/database';
import { I18nModule } from '@favor/rpc';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethodsService } from './payment-methods.service';

@Module({
  imports: [DatabaseModule, I18nModule],
  controllers: [PaymentMethodsController],
  providers: [PaymentMethodsService],
})
export class PaymentMethodsServiceModule { }
