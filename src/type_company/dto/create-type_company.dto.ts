import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTypeCompanyDto {
  @IsString()
  @IsNotEmpty({ message: 'Le nom du type d’entreprise est requis.' })
  @MaxLength(50, { message: 'Le nom ne peut pas dépasser 50 caractères.' })
  name: string;

  @IsString()
  @IsOptional()
  image?: string;
}
