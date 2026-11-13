import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCityDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsUUID()
  countryId: string;

  @IsOptional()
  @IsObject()
  tarif?: any; // L'utilisateur peut envoyer n'importe quel JSON
}