import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class CreateAttributeValueDto {
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
}
