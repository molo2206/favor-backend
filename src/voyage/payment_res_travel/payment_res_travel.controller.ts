import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { PaymentResTravelService } from './payment_res_travel.service';
import { CreatePaymentResTravelDto } from './dto/create-payment_res_travel.dto';
import { UpdatePaymentResTravelDto } from './dto/update-payment_res_travel.dto';

@Controller('payment-res-travel')
export class PaymentResTravelController {
  constructor(private readonly paymentResTravelService: PaymentResTravelService) {}

  @Post()
  create(@Body() createPaymentResTravelDto: CreatePaymentResTravelDto) {
    return this.paymentResTravelService.create(createPaymentResTravelDto);
  }

  @Get()
  findAll() {
    return this.paymentResTravelService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentResTravelService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePaymentResTravelDto: UpdatePaymentResTravelDto) {
    return this.paymentResTravelService.update(+id, updatePaymentResTravelDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.paymentResTravelService.remove(+id);
  }
}
