import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePermissionDto {
    @IsString()
    @IsNotEmpty({ message: 'Permission name cannot be empty' })
    name: string;

    @IsOptional()
    @IsString()
    description?: string;
}
