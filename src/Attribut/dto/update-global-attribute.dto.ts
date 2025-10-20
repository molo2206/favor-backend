import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateGlobalAttributeDto } from './create-global-attribute.dto';
import { Type } from 'class-transformer';
import { ValidateNested, IsOptional, IsArray } from 'class-validator';
import { UpdateGlobalAttributeValueDto } from './update-global-attribute-value.dto';

// On retire 'values' du PartialType pour pouvoir le redéfinir
export class UpdateGlobalAttributeDto extends PartialType(
  OmitType(CreateGlobalAttributeDto, ['values'] as const),
) {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateGlobalAttributeValueDto)
  values?: UpdateGlobalAttributeValueDto[];
}
