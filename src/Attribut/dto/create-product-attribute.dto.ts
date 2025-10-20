import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, IsUUID, IsArray, ValidateNested } from 'class-validator';
import { CreateAttributeValueDto } from './create-attribute-value.dto';

export class CreateProductAttributeDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  globalAttrId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAttributeValueDto)
  @IsOptional()
  values?: CreateAttributeValueDto[];
}
