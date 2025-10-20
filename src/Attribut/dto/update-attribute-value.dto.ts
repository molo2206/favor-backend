import { PartialType } from '@nestjs/mapped-types';
import { CreateAttributeValueDto } from './create-attribute-value.dto';
import { IsUUID, IsOptional } from 'class-validator';

export class UpdateAttributeValueDto extends PartialType(CreateAttributeValueDto) {
  @IsUUID()
  @IsOptional()
  id?: string;
}
