import { Controller, Post, Get, Delete, Param, Body, UseGuards, Patch } from '@nestjs/common';
import { UserPlatformRoleService } from './user-platform-role.service';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize.roles.decorator';
import { CurrentUser } from './utility/decorators/current-user-decorator';
import { UserEntity } from './entities/user.entity';
import { AssignRoleDto } from './dto/roles_plateforme_user/assign-role.dto';
import { AssignResourcesDto } from './dto/assignResourcesToUser.dto';

@Controller('user-platform-roles')
export class UserPlatformRoleController {
  constructor(private readonly uprService: UserPlatformRoleService) {}

  /** Assignation de rôles à un utilisateur pour une ou plusieurs plateformes */
  @Post('assign')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async assignRole(@Body() dto: AssignRoleDto) {
    const result = await this.uprService.assignRole(dto);
    return result;
  }

  /** Récupérer tous les rôles d'un utilisateur */
  @Get('user/me')
  @UseGuards(AuthentificationGuard)
  async findRolesByUser(@CurrentUser() user: UserEntity) {
    const roles = await this.uprService.findRolesByUser(user.id);
    return {
      message: `Rôles de l'utilisateur récupérés avec succès`,
      data: roles,
    };
  }

  /** Supprimer un assignement de rôle */
  @Delete(':id')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async remove(@Param('id') id: string) {
    await this.uprService.remove(id);
    return {
      message: 'Assignation de rôle supprimée avec succès',
      data: null,
    };
  }

  @Post('/user/assign-resources')
  async assignResources(@Body() assignResourcesDto: AssignResourcesDto) {
    const { userId, platformId, roleId, branchId, resources } = assignResourcesDto;
    return this.uprService.assignResourcesToUser(
      userId,
      platformId,
      roleId,
      branchId,
      resources,
    );
  }

  @Get('all_permission')
  async findAllWithRelations() {
    return this.uprService.findAllPermissions();
  }

  @Get('permission/:id')
  async findOnePermission(@Param('id') id: string) {
    return this.uprService.findOnePermission(id);
  }

  @Patch('update-resources/:userPlatformRoleId')
  async updateResources(
    @Param('userPlatformRoleId') userPlatformRoleId: string,
    @Body()
    body: {
      branchId: string;
      resources: {
        resourceId: string;
        create?: boolean;
        update?: boolean;
        read?: boolean;
        delete?: boolean;
        validate?: boolean;
      }[];
    },
  ) {
    const { branchId, resources } = body;
    const { message, data } = await this.uprService.updateResourcesForUser(
      userPlatformRoleId,
      branchId,
      resources,
    );
    return { message, data };
  }
}
