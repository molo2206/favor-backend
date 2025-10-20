import { PartialType } from '@nestjs/mapped-types';
import { CreateGlobalAttributeValueDto } from './create-global-attribute-value.dto';
import { IsUUID } from 'class-validator';

export class UpdateGlobalAttributeValueDto extends PartialType(CreateGlobalAttributeValueDto) {
  @IsUUID()
  id: string; // Obligatoire pour savoir quelle valeur mettre à jour
}
