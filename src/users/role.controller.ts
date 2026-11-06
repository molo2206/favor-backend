import { Controller, Get, Post, Delete, Param, Body, UseGuards, Patch } from '@nestjs/common';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/roles_plateforme_user/create-role.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize.roles.decorator';

@Controller('role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  /** Créer un rôle */
  @Post()
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async create(@Body() createRoleDto: CreateRoleDto) {
    const role = await this.roleService.create(createRoleDto);
    return {
      message: 'Rôle créé avec succès',
      data: role,
    };
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async update(@Param('id') id: string, @Body() dto: Partial<CreateRoleDto>) {
    const updatedRole = await this.roleService.update(id, dto);
    return {
      message: 'Rôle mis à jour avec succès',
      data: updatedRole,
    };
  }

  /** Récupérer tous les rôles */
  @Get()
  async findAll() {
    const roles = await this.roleService.findAll();
    return {
      message: 'Liste des rôles récupérée avec succès',
      data: roles,
    };
  }

  /** Récupérer un rôle par ID */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const role = await this.roleService.findOne(id);
    return {
      message: 'Rôle récupéré avec succès',
      data: role,
    };
  }

  /** Supprimer un rôle */
  @Delete(':id')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async delete(@Param('id') id: string) {
    const deletedRole = await this.roleService.delete(id);
    return {
      message: 'Rôle supprimé avec succès',
      data: deletedRole,
    };
  }

  @Patch(':id/status')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async changerStatus(
    @Param('id') id: string,
    @Body() dto: Partial<CreateRoleDto> & { status?: boolean },
  ) {
    const updated = await this.roleService.changerStatus(id, dto);
    return {
      message: `Status du rôle mis à jour avec succès`,
      data: updated,
    };
  }
}
