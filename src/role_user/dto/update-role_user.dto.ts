import { PartialType } from '@nestjs/swagger';
import { CreateRoleUserDto } from './create-role_user.dto';

export class UpdateRoleUserDto extends PartialType(CreateRoleUserDto) {}
