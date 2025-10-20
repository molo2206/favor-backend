import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateGlobalAttributeValueDto } from './create-global-attribute-value.dto';

export class CreateGlobalAttributeDto {
  @IsString()
  name: string;

  @IsString()
  platform: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateGlobalAttributeValueDto)
  values?: CreateGlobalAttributeValueDto[];
}
