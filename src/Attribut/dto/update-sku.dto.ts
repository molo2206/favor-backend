import { CreateSkuDto } from './create-sku.dto';
import { PartialType } from '@nestjs/mapped-types';

export class UpdateSkuDto extends PartialType(CreateSkuDto) {}