import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { CreatePlatformDto } from './dto/roles_plateforme_user/create-platform.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize.roles.decorator';

@Controller('platforms')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  /** Créer une plateforme */
  @Post()
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async create(@Body() createPlatformDto: CreatePlatformDto) {
    const platform = await this.platformService.create(createPlatformDto);
    return {
      message: 'Plateforme créée avec succès',
      data: platform,
    };
  }

  /** Récupérer toutes les plateformes */
  @Get()
  async findAll() {
    const platforms = await this.platformService.findAll();
    return {
      message: 'Liste des plateformes récupérée avec succès',
      data: platforms,
    };
  }

  /** Récupérer une plateforme par ID */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const platform = await this.platformService.findOne(id);
    return {
      message: 'Plateforme récupérée avec succès',
      data: platform,
    };
  }

  /** Mettre à jour une plateforme */
  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async update(@Param('id') id: string, @Body() dto: Partial<CreatePlatformDto>) {
    const updatedPlatform = await this.platformService.update(id, dto);
    return {
      message: 'Plateforme mise à jour avec succès',
      data: updatedPlatform,
    };
  }

  /** Supprimer une plateforme */
  @Delete(':id')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async delete(@Param('id') id: string) {
    const deletedPlatform = await this.platformService.delete(id);
    return {
      message: 'Plateforme supprimée avec succès',
      data: deletedPlatform,
    };
  }

  @Patch(':id/status')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: Partial<CreatePlatformDto> & { status?: boolean },
  ) {
    const updated = await this.platformService.changeStatus(id, dto);
    return {
      message: `Status de la plateforme mis à jour avec succès`,
      data: updated,
    };
  }
}
