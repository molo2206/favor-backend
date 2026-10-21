import { IsString, IsOptional, IsInt, Min, IsUUID, IsBoolean, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAttributeValueDto {
  @IsOptional()
  @IsUUID()
  id?: string; // <- pour l'update

  @IsString()
  @MaxLength(255)
  value: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  // ✅ NOUVEAU
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Obligatoire pour POST /attributes/value ; inutile quand la valeur est envoyée
  // à l'intérieur de la création / mise à jour d'un attribut (values: [...])
  @IsOptional()
  @IsUUID()
  attributeId: string;
}
