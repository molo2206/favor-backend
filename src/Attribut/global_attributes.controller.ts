import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { GlobalAttributeService } from './global_attributes.service';
import { CreateGlobalAttributeDto } from './dto/create-global-attribute.dto';
import { UpdateGlobalAttributeDto } from './dto/update-global-attribute.dto';
import { CreateGlobalAttributeValueDto } from './dto/create-global-attribute-value.dto';

@Controller('global-attributes')
export class GlobalAttributeController {
  constructor(private readonly attrService: GlobalAttributeService) {}

  // 🔹 Créer un nouvel attribut global avec valeurs et spécifications
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: false }))
  async create(@Body() data: CreateGlobalAttributeDto) {
    return this.attrService.createWithValuesAndSpecs(data);
  }

  // 🔹 Récupérer tous les attributs (optionnel : filtrer par platform)
  @Get()
  async findAll(@Query('platform') platform?: string) {
    return this.attrService.findAll(platform);
  }

  // 🔹 Récupérer un attribut global par ID
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.attrService.findOne(id);
  }

  // 🔹 Mettre à jour un attribut global avec valeurs et spécifications
  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async update(@Param('id') id: string, @Body() data: UpdateGlobalAttributeDto) {
    return this.attrService.updateWithValues(id, data);
  }

  // 🔹 Supprimer un attribut global
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.attrService.remove(id);
  }

  // 🔹 Ajouter une valeur à un attribut existant
  @Post('values')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async addValue(@Body() valueData: CreateGlobalAttributeValueDto) {
    return this.attrService.addValue(valueData);
  }

  // 🔹 Supprimer une valeur d'un attribut
  @Delete('values/:valueId')
  async removeValue(@Param('valueId') valueId: string) {
    return this.attrService.removeValue(valueId);
  }
}
