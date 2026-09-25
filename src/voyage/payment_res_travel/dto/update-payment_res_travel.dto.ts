import { PartialType } from '@nestjs/swagger';
import { CreatePaymentResTravelDto } from './create-payment_res_travel.dto';

export class UpdatePaymentResTravelDto extends PartialType(CreatePaymentResTravelDto) {}
