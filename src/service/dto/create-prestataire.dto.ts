import { IsString, IsOptional, IsEmail, IsArray } from 'class-validator';

export class CreatePrestataireDto {
  @IsString()
  full_name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString({ each: true })
  image?: string;

  @IsOptional()
  @IsString()
  experience?: string; // ex: "2 ans"

  @IsOptional()
  @IsString()
  competence?: string; // ex: "réparation fuites, installation sanitaire"

  @IsOptional()
  @IsString()
  specialite?: string; // ex: "Informaticien, Médecin"
}
