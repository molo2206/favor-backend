import { Controller, Get, Post, Patch, Delete, Param, Body, Logger, Query } from '@nestjs/common';
import { AttributeService } from './attribute.service';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';
import { CreateAttributeValueDto } from './dto/create-attribute-value.dto';
import { UpdateAttributeValueDto } from './dto/update-attribute-value.dto';
import { AttributeType } from './enum/attributeType.enum';

@Controller('attributes')
export class AttributeController {
  private readonly logger = new Logger(AttributeController.name);

  constructor(private readonly attributeService: AttributeService) { }

  // -------------------------------
  // Création d'un attribut
  // -------------------------------
  @Post()
  async create(@Body() createAttributeDto: CreateAttributeDto) {
    return this.attributeService.create(createAttributeDto);
  }

  // -------------------------------
  // Récupération de tous les attributs
  // GET /attributes?active=true → seulement les attributs actifs
  // -------------------------------
  @Get()
  async findAll(@Query('active') active?: string) {
    const data = await this.attributeService.findAll(active === 'true' || active === '1');
    return {
      message: 'Liste de tous les attributs récupérée avec succès',
      data,
    };
  }

  // ⚠️ Les routes fixes doivent être déclarées AVANT ':id'
  @Get('filterable')
  async findFilterable() {
    const data = await this.attributeService.findByFilterable();
    return {
      message: 'Attributs filtrables récupérés avec succès',
      data,
    };
  }

  @Get('type/:type')
  async findByType(@Param('type') type: AttributeType) {
    const data = await this.attributeService.findByType(type);
    return {
      message: `Attributs de type "${type}" récupérés avec succès`,
      data,
    };
  }

  @Get('category/:categoryId/attributes/by-category')
  async getAttributesByCategory(@Param('categoryId') categoryId: string) {
    return this.attributeService.findAttributesByCategory(categoryId);
  }

  // -------------------------------
  // Valeurs d'attribut
  // -------------------------------
  @Post('value')
  async createSingleValue(@Body() body: CreateAttributeValueDto & { attributeId: string }) {
    return this.attributeService.createSingleAttributeValue(body);
  }

  @Patch('value/:id')
  async updateSingleValue(@Param('id') id: string, @Body() body: UpdateAttributeValueDto) {
    return this.attributeService.updateSingleAttributeValue(id, body);
  }

  @Get('value/:id')
  async getOneValue(@Param('id') id: string) {
    return this.attributeService.getOneValue(id);
  }

  // ✅ NOUVEAU : supprime la valeur (ou la désactive si des produits l'utilisent)
  @Delete('value/:id')
  async removeValue(@Param('id') id: string) {
    return this.attributeService.removeAttributeValue(id);
  }

  // GET /attributes/:attributeId/values?active=true
  @Get(':attributeId/values')
  async getValuesByAttribute(
    @Param('attributeId') attributeId: string,
    @Query('active') active?: string,
  ) {
    return this.attributeService.getValuesByAttribute(attributeId, !(active === 'true' || active === '1'));
  }

  // -------------------------------
  // Un attribut
  // -------------------------------
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.attributeService.findOne(id);
    return {
      message: `Attribut avec l'ID ${id} récupéré avec succès`,
      data,
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateAttributeDto: UpdateAttributeDto) {
    return this.attributeService.update(id, updateAttributeDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.attributeService.remove(id);
  }

  @Patch(':id/soft-delete')
  async softDelete(@Param('id') id: string) {
    return this.attributeService.softDelete(id);
  }

  // ✅ NOUVEAU
  @Patch(':id/restore')
  async restore(@Param('id') id: string) {
    return this.attributeService.restore(id);
  }
}
