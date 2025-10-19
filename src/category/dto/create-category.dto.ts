import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { SpecificationDto } from './SpecificationDto.dto';
import { Type } from 'class-transformer';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  parentId?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SpecificationDto)
  specifications?: SpecificationDto[];
}
