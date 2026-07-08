import { IsOptional, IsArray, IsString } from 'class-validator';

export class UpdatePrestataireDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceIds?: string[];
}
