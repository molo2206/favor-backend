import { Injectable } from '@nestjs/common';
import { CreateSubOrderItemDto } from './dto/create-sub-order-item.dto';
import { UpdateSubOrderItemDto } from './dto/update-sub-order-item.dto';

@Injectable()
export class SubOrderItemService {
  create(createSubOrderItemDto: CreateSubOrderItemDto) {
    return 'This action adds a new subOrderItem';
  }

  findAll() {
    return `This action returns all subOrderItem`;
  }

  findOne(id: number) {
    return `This action returns a #${id} subOrderItem`;
  }

  update(id: number, updateSubOrderItemDto: UpdateSubOrderItemDto) {
    return `This action updates a #${id} subOrderItem`;
  }

  remove(id: number) {
    return `This action removes a #${id} subOrderItem`;
  }
}
