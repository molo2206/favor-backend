import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ResourceService } from './resource.service';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';

@Controller('resources')
export class ResourceController {
  constructor(private readonly service: ResourceService) {}

  // 🔹 Lister toutes les ressources
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll() {
    return this.service.findAll();
  }

  // 🔹 Détails d'une ressource
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // 🔹 Créer une ressource
  @Post()
  @UseGuards(AuthentificationGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() payload: any) {
    return this.service.create(payload);
  }

  // 🔹 Modifier une ressource
  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  @HttpCode(HttpStatus.OK)
  update(@Param('id') id: string, @Body() payload: any) {
    return this.service.update(id, payload);
  }

  // 🔹 Supprimer (soft delete)
  @Delete(':id')
  @UseGuards(AuthentificationGuard)
  @HttpCode(HttpStatus.OK)
  softDelete(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
