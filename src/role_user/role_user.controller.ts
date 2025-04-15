import { Controller, Post, Get, Param, Body, Put, Delete, UsePipes, ValidationPipe, UseGuards } from '@nestjs/common';
import { RoleUserService } from './role_user.service';
import { RoleUser } from './entities/role_user.entity';
import { CreateRoleUserDto } from './dto/create-role_user.dto';
import { UpdateRoleUserDto } from './dto/update-role_user.dto';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { UserRole } from 'src/users/utility/common/user-role-enum';


@Controller('roles')
export class RoleUserController {
  constructor(private readonly roleUserService: RoleUserService) { }

  @Post()
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  create(@Body() dto: CreateRoleUserDto): Promise<RoleUser> {
    return this.roleUserService.create(dto);
  }

  @Get()
  findAll(): Promise<RoleUser[]> {
    return this.roleUserService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<RoleUser> {
    return this.roleUserService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoleUserDto): Promise<RoleUser> {
    return this.roleUserService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.roleUserService.remove(id);
  }
}
