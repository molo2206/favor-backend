import { IsString, IsOptional, IsInt, Min, IsUUID } from 'class-validator';

export class CreateAttributeValueDto {
  @IsOptional()
  @IsUUID()
  id?: string; // <- pour l'update

  @IsString()
  value: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @IsUUID()
  attributeId: string;
}
