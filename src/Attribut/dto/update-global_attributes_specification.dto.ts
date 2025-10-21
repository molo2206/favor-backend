import { PartialType } from '@nestjs/mapped-types';
import { CreateGlobalAttributesSpecificationDto } from './create-global_attributes_specification.dto';

export class UpdateGlobalAttributesSpecificationDto extends PartialType(
  CreateGlobalAttributesSpecificationDto,
) {}
