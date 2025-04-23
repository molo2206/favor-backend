import { PartialType } from '@nestjs/swagger';
import { CreateSubOrderItemDto } from './create-sub_order_item.dto';

export class UpdateSubOrderItemDto extends PartialType(CreateSubOrderItemDto) {}
