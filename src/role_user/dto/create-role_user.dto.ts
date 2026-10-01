import { IsNotEmpty, IsString } from 'class-validator';

export class CreateRoleUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
