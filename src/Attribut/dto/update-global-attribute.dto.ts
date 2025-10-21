import { IsOptional, IsArray } from 'class-validator';
import { UpdateAttributeValueDto } from './update-attribute-value.dto';

export class UpdateGlobalAttributeDto {
  @IsOptional()
  key?: string;

  @IsOptional()
  label?: string;

  @IsOptional()
  type?: string;

  @IsOptional()
  unit?: string;

  @IsOptional()
  options?: any;

  @IsOptional()
  @IsArray()
  values?: UpdateAttributeValueDto[]; // <- ajoute cette propriété
}
