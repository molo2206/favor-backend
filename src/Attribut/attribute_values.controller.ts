import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { AttributeValueService } from './attribute_values.service';
import { CreateAttributeValueDto } from './dto/create-attribute-value.dto';
import { UpdateAttributeValueDto } from './dto/update-attribute-value.dto';

@Controller('attribute-values')
export class AttributeValueController {
  constructor(private readonly attrValueService: AttributeValueService) {}

  @Post()
  async create(@Body() data: CreateAttributeValueDto) {
    return this.attrValueService.create(data);
  }

  @Get()
  async findAll(@Query('attributeId') attributeId: string) {
    return this.attrValueService.findByAttribute(attributeId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.attrValueService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() data: UpdateAttributeValueDto) {
    return this.attrValueService.update(id, data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.attrValueService.remove(id);
  }
}
