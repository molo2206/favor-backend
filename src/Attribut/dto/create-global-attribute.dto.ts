import { Type } from 'class-transformer';
import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { CreateGlobalAttributeValueDto } from './create-global-attribute-value.dto';
import { CreateGlobalAttributesSpecificationDto } from './create-global_attributes_specification.dto';

export class CreateGlobalAttributeDto {
  @IsString()
  name: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateGlobalAttributeValueDto)
  values?: CreateGlobalAttributeValueDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGlobalAttributesSpecificationDto)
  specifications?: CreateGlobalAttributesSpecificationDto[];
}
