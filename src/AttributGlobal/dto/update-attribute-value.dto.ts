import { IsString, IsOptional, IsInt, IsUrl } from 'class-validator';

export class UpdateAttributeValueDto {
  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsUrl({}, { message: 'imageUrl doit être une URL valide' })
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  position?: number;
}
