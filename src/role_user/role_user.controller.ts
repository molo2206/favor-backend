import { Controller, Post, Get, Param, Body, Put, Delete, UsePipes, ValidationPipe, UseGuards } from '@nestjs/common';
import { RoleUserService } from './role_user.service';
import { RoleUser } from './entities/role_user.entity';
import { CreateRoleUserDto } from './dto/create-role_user.dto';
import { UpdateRoleUserDto } from './dto/update-role_user.dto';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { UserRole } from 'src/users/enum/user-role-enum';


@Controller('roles')
export class RoleUserController {
  constructor(private readonly roleUserService: RoleUserService) { }
  @Post()
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(@Body() dto: CreateRoleUserDto): Promise<{ message: string; data: RoleUser }> {
    return this.roleUserService.create(dto);
  }

  @Put(':id')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async update(@Param('id') id: string, @Body() dto: UpdateRoleUserDto): Promise<{ message: string; data: RoleUser }> {
    return this.roleUserService.update(id, dto);
  }

  @Get()
  findAll(): Promise<RoleUser[]> {
    return this.roleUserService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<RoleUser> {
    return this.roleUserService.findOne(id);
  }



  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.roleUserService.remove(id);
  }
}
