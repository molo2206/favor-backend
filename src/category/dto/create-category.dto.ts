import {
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SpecificationsDto } from './specification.dto';

class AttributeDto {
  @IsString()
  attribute_id: string;
}

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  maxPassengers?: number;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SpecificationsDto)
  specifications?: SpecificationsDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeDto)
  attributes?: AttributeDto[];
}
