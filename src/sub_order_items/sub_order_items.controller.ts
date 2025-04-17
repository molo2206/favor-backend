import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CreateSubOrderItemDto } from './dto/create-sub_order_item.dto';
import { UpdateSubOrderItemDto } from './dto/update-sub_order_item.dto';
import { SubOrderItemService } from './sub_order_items.service';

@Controller('sub-order-items')
export class SubOrderItemsController {
  constructor(private readonly subOrderItemsService: SubOrderItemService) {}

  @Post()
  create(@Body() createSubOrderItemDto: CreateSubOrderItemDto) {
    return this.subOrderItemsService.create(createSubOrderItemDto);
  }

  @Get()
  findAll() {
    return this.subOrderItemsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subOrderItemsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSubOrderItemDto: UpdateSubOrderItemDto) {
    return this.subOrderItemsService.update(id, updateSubOrderItemDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.subOrderItemsService.remove(id);
  }
}
