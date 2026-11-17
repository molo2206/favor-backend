import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { I18nModule } from 'src/libs/common/src';
import { UserPaymentMethodEntity } from './entities/user-payment-method.entity';
import { UserPaymentMethodsService } from './user-payment-methods.service';
import { UserPaymentMethodsController } from './user-payment-methods.controller';

/** ✅ Moyens de paiement des utilisateurs (Mobile Money, FPay, Cash) — utilisable partout (global) */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserPaymentMethodEntity]), I18nModule],
  controllers: [UserPaymentMethodsController],
  providers: [UserPaymentMethodsService],
  exports: [UserPaymentMethodsService],
})
export class UserPaymentMethodsModule { }
