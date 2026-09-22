import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { SubOrderService } from './sub-order.service';
import { CreateSubOrderDto } from './dto/create-sub-order.dto';
import { UpdateSubOrderDto } from './dto/update-sub-order.dto';

@Controller('sub-order')
export class SubOrderController {
  constructor(private readonly subOrderService: SubOrderService) {}

  @Post()
  create(@Body() createSubOrderDto: CreateSubOrderDto) {
    return this.subOrderService.create(createSubOrderDto);
  }

  @Get()
  findAll() {
    return this.subOrderService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subOrderService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSubOrderDto: UpdateSubOrderDto) {
    return this.subOrderService.update(+id, updateSubOrderDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.subOrderService.remove(+id);
  }
}
