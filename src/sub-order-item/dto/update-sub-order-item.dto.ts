import { PartialType } from '@nestjs/swagger';
import { CreateSubOrderItemDto } from './create-sub-order-item.dto';

export class UpdateSubOrderItemDto extends PartialType(CreateSubOrderItemDto) {}
