import { Controller, Get, Post, Patch, Delete, Param, Body, Logger } from '@nestjs/common';
import { AttributeService } from './attribute.service';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';
import { CreateAttributeValueDto } from './dto/create-attribute-value.dto';
import { AttributeType } from './enum/attributeType.enum';

@Controller('attributes')
export class AttributeController {
  private readonly logger = new Logger(AttributeController.name);

  constructor(private readonly attributeService: AttributeService) {}

  // -------------------------------
  // Création d'un attribut
  // -------------------------------
  @Post()
  async create(@Body() createAttributeDto: CreateAttributeDto) {
    return this.attributeService.create(createAttributeDto);
  }

  // -------------------------------
  // Mise à jour d'un attribut
  // -------------------------------
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateAttributeDto: UpdateAttributeDto) {
    return this.attributeService.update(id, updateAttributeDto);
  }

  // -------------------------------
  // Récupération de tous les attributs
  // -------------------------------
  @Get()
  async findAll() {
    const data = await this.attributeService.findAll();
    return {
      message: 'Liste de tous les attributs récupérée avec succès',
      data,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.attributeService.findOne(id);
    return {
      message: `Attribut avec l'ID ${id} récupéré avec succès`,
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

  @Get('filterable')
  async findFilterable() {
    const data = await this.attributeService.findByFilterable();
    return {
      message: 'Attributs filtrables récupérés avec succès',
      data,
    };
  }

  // -------------------------------
  // Supprimer un attribut
  // -------------------------------
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.attributeService.remove(id);
  }

  // -------------------------------
  // Soft delete d'un attribut
  // -------------------------------
  @Patch(':id/soft-delete')
  async softDelete(@Param('id') id: string) {
    return this.attributeService.softDelete(id);
  }
  @Post('value')
  async createSingleValue(@Body() body: CreateAttributeValueDto & { attributeId: string }) {
    return this.attributeService.createSingleAttributeValue(body);
  }

  // Modification
  @Patch('value/:id')
  async updateSingleValue(
    @Param('id') id: string,
    @Body() body: Partial<CreateAttributeValueDto>,
  ) {
    return this.attributeService.updateSingleAttributeValue(id, body);
  }

  @Get('value/:id')
  async getOneValue(@Param('id') id: string) {
    return this.attributeService.getOneValue(id);
  }

  @Get(':attributeId/values')
  async getValuesByAttribute(@Param('attributeId') attributeId: string) {
    return this.attributeService.getValuesByAttribute(attributeId);
  }
}
