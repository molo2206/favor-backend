import { Controller, Get,  Param, Delete } from '@nestjs/common';
import { SubOrderService } from './sub_orders.service';

@Controller('sub-orders')
export class SubOrdersController {
  constructor(private readonly subOrdersService: SubOrderService) {}



  @Get()
  findAll() {
    return this.subOrdersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subOrdersService.findOne(id);
  }



  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.subOrdersService.remove(id);
  }
}
