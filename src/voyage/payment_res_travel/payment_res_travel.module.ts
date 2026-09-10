import { Module } from '@nestjs/common';
import { PaymentResTravelService } from './payment_res_travel.service';
import { PaymentResTravelController } from './payment_res_travel.controller';

@Module({
  controllers: [PaymentResTravelController],
  providers: [PaymentResTravelService],
})
export class PaymentResTravelModule {}
