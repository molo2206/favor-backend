import { Injectable } from '@nestjs/common';
import { CreateSubOrderDto } from './dto/create-sub-order.dto';
import { UpdateSubOrderDto } from './dto/update-sub-order.dto';

@Injectable()
export class SubOrderService {
  create(createSubOrderDto: CreateSubOrderDto) {
    return 'This action adds a new subOrder';
  }

  findAll() {
    return `This action returns all subOrder`;
  }

  findOne(id: number) {
    return `This action returns a #${id} subOrder`;
  }

  update(id: number, updateSubOrderDto: UpdateSubOrderDto) {
    return `This action updates a #${id} subOrder`;
  }

  remove(id: number) {
    return `This action removes a #${id} subOrder`;
  }
}
