import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { GlobalAttributeService } from './global_attributes.service';
import { CreateGlobalAttributeDto } from './dto/create-global-attribute.dto';
import { UpdateGlobalAttributeDto } from './dto/update-global-attribute.dto';
import { CreateCategoryAttributeDto } from './dto/create-category-attribute.dto';

@Controller('global-attributes')
export class GlobalAttributeController {
  constructor(private readonly attrService: GlobalAttributeService) {}

  // 🔹 Créer un nouvel attribut global avec valeurs optionnelles
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async create(@Body() data: CreateGlobalAttributeDto) {
    return this.attrService.create(data);
  }

  // 🔹 Récupérer tous les attributs globaux
  @Get()
  async findAll() {
    return this.attrService.findAll();
  }

  // 🔹 Récupérer un attribut global par ID
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.attrService.findOne(id);
  }

  // 🔹 Mettre à jour un attribut global et ses valeurs
  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async update(@Param('id') id: string, @Body() data: UpdateGlobalAttributeDto) {
    return this.attrService.update(id, data);
  }

  // 🔹 Supprimer un attribut global
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.attrService.remove(id);
  }

  //  Supprimer une valeur spécifique d'un attribut
  @Delete('values/:valueId')
  async removeValue(@Param('valueId') valueId: string) {
    return this.attrService.removeValue(valueId);
  }

  @Post('')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async createCategoryAttribut(@Body() dto: CreateCategoryAttributeDto) {
    return this.attrService.createMany(dto);
  }
}
