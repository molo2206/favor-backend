import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { GlobalAttributeService } from './global_attributes.service';
import { CreateGlobalAttributeDto } from './dto/create-global-attribute.dto';
import { UpdateGlobalAttributeDto } from './dto/update-global-attribute.dto';
import { CreateGlobalAttributeValueDto } from './dto/create-global-attribute-value.dto';

@Controller('global-attributes')
export class GlobalAttributeController {
  constructor(private readonly attrService: GlobalAttributeService) {}

  @Post()
  async create(@Body() data: CreateGlobalAttributeDto) {
    return this.attrService.createWithValues(data);
  }

  @Get()
  async findAll(@Query('platform') platform?: string) {
    return this.attrService.findAll(platform);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.attrService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() data: UpdateGlobalAttributeDto) {
    return this.attrService.updateWithValues(id, data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.attrService.remove(id);
  }

  @Post('/values')
  async addValue(@Body() valueData: CreateGlobalAttributeValueDto) {
    return this.attrService.addValue(valueData);
  }

  @Delete('values/:valueId')
  async removeValue(@Param('valueId') valueId: string) {
    return this.attrService.removeValue(valueId);
  }
}
