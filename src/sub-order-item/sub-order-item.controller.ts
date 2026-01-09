import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { SubOrderItemService } from './sub-order-item.service';
import { CreateSubOrderItemDto } from './dto/create-sub-order-item.dto';
import { UpdateSubOrderItemDto } from './dto/update-sub-order-item.dto';

@Controller('sub-order-item')
export class SubOrderItemController {
  constructor(private readonly subOrderItemService: SubOrderItemService) {}

  @Post()
  create(@Body() createSubOrderItemDto: CreateSubOrderItemDto) {
    return this.subOrderItemService.create(createSubOrderItemDto);
  }

  @Get()
  findAll() {
    return this.subOrderItemService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subOrderItemService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSubOrderItemDto: UpdateSubOrderItemDto) {
    return this.subOrderItemService.update(+id, updateSubOrderItemDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.subOrderItemService.remove(+id);
  }
}
