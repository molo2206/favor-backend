import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  Put,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CreateUserHasPermissionDto } from './dto/create-user_has_company_permission.dto';
import { UserHasCompanyPermissionService } from './user_has_company_permissions.service';
import { UpdateUserHasCompanyPermissionDto } from './dto/update-user_has_company_permission.dto';

@Controller('assign_permissions')
@UseGuards(AuthentificationGuard)
export class UserHasCompanyController {
  constructor(private readonly permissionService: UserHasCompanyPermissionService) { }

  // ✅ Créer une affectation de permission avec actions
  @Post()
  async assignPermission(@Body() dto: CreateUserHasPermissionDto) {
    return this.permissionService.assignPermissionsToUserCompany(dto);
  }

  // ✅ Obtenir toutes les permissions attribuées
  @Get()
  async findAll() {
    return this.permissionService.findAll();
  }

  // ✅ Obtenir une permission spécifique par ID
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.permissionService.findOne(id);
  }

  // ✅ Mettre à jour une permission
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserHasCompanyPermissionDto,  // Utilisation du DTO de mise à jour
  ) {
    return this.permissionService.update(id, dto);
  }

  // ✅ Supprimer une permission
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return this.permissionService.remove(id);
  }
}
