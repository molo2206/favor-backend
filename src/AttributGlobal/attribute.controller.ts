import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  ClassSerializerInterceptor,
  Patch,
} from '@nestjs/common';
import { AttributeService } from './attribute.service';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';
import { Attribute } from './entities/attributes.entity';
import { AttributeType } from './enum/attributeType.enum';

@Controller('global-attributes')
@UseInterceptors(ClassSerializerInterceptor)
export class AttributeController {
  constructor(private readonly attributeService: AttributeService) {}

  @Post()
  async create(@Body() createAttributeDto: CreateAttributeDto) {
    return await this.attributeService.create(createAttributeDto);
  }

  @Get()
  async findAll() {
    const attributes = await this.attributeService.findAll();
    return {
      message: attributes.length
        ? 'Tous les attributs récupérés avec succès.'
        : 'Aucun attribut trouvé.',
      data: attributes,
      count: attributes.length,
    };
  }

  @Get('filterable')
  async findFilterable() {
    const attributes = await this.attributeService.findByFilterable();
    return {
      message: attributes.length
        ? 'Attributs filtrables récupérés avec succès.'
        : 'Aucun attribut filtrable trouvé.',
      data: attributes,
      count: attributes.length,
    };
  }

  @Get('type/:type')
  async findByType(@Param('type') type: AttributeType) {
    const attributes = await this.attributeService.findByType(type);
    return {
      message: attributes.length
        ? `Attributs du type "${type}" récupérés avec succès.`
        : `Aucun attribut trouvé pour le type "${type}".`,
      data: attributes,
      count: attributes.length,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const attribute = await this.attributeService.findOne(id);
    return {
      message: `Attribut avec l'id "${id}" récupéré avec succès.`,
      data: attribute,
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateAttributeDto: UpdateAttributeDto) {
    return await this.attributeService.update(id, updateAttributeDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return await this.attributeService.remove(id);
  }

  @Delete(':id/soft')
  async softDelete(@Param('id') id: string) {
    return await this.attributeService.softDelete(id);
  }

  @Post(':id/values')
  async addValueToAttribute(
    @Param('id') attributeId: string,
    @Body() valueData: { value: string; displayOrder?: number },
  ) {
    return await this.attributeService.addValueToAttribute(attributeId, valueData);
  }
}
