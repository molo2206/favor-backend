import { Injectable } from '@nestjs/common';
import { CreateReservServiceDto } from './dto/create-reserv-service.dto';
import { UpdateReservServiceDto } from './dto/update-reserv-service.dto';

@Injectable()
export class ReservServiceService {
  create(createReservServiceDto: CreateReservServiceDto) {
    return 'This action adds a new reservService';
  }

  findAll() {
    return `This action returns all reservService`;
  }

  findOne(id: number) {
    return `This action returns a #${id} reservService`;
  }

  update(id: number, updateReservServiceDto: UpdateReservServiceDto) {
    return `This action updates a #${id} reservService`;
  }

  remove(id: number) {
    return `This action removes a #${id} reservService`;
  }
}
