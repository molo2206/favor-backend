import { Injectable } from '@nestjs/common';
import { CreatePaymentResTravelDto } from './dto/create-payment_res_travel.dto';
import { UpdatePaymentResTravelDto } from './dto/update-payment_res_travel.dto';

@Injectable()
export class PaymentResTravelService {
  create(createPaymentResTravelDto: CreatePaymentResTravelDto) {
    return 'This action adds a new paymentResTravel';
  }

  findAll() {
    return `This action returns all paymentResTravel`;
  }

  findOne(id: number) {
    return `This action returns a #${id} paymentResTravel`;
  }

  update(id: number, updatePaymentResTravelDto: UpdatePaymentResTravelDto) {
    return `This action updates a #${id} paymentResTravel`;
  }

  remove(id: number) {
    return `This action removes a #${id} paymentResTravel`;
  }
}
