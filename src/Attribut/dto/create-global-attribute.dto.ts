import { Type } from 'class-transformer';
import { IsString, IsOptional, IsArray, ValidateNested, IsEnum } from 'class-validator';
import { CreateGlobalAttributeValueDto } from './create-global-attribute-value.dto';
import { AttributeType } from '../enum/attribute_type.enum';

export class CreateGlobalAttributeDto {
  @IsString()
  key: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsEnum(AttributeType)
  type?: AttributeType;

  // options peut être une chaîne CSV ou un tableau
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}
