import { IsString, IsOptional, IsEmail, IsArray } from 'class-validator';

export class CreatePrestataireDto {
  @IsString()
  full_name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString({ each: true })
  photo?: string;
}
