import { IsString, IsOptional, IsInt, IsUrl, IsBoolean, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAttributeValueDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  value?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @IsOptional()
  @IsUrl({}, { message: 'imageUrl doit être une URL valide' })
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
}
