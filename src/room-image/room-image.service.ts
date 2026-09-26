import { Injectable } from '@nestjs/common';
import { CreateRoomImageDto } from './dto/create-room-image.dto';
import { UpdateRoomImageDto } from './dto/update-room-image.dto';

@Injectable()
export class RoomImageService {
  create(createRoomImageDto: CreateRoomImageDto) {
    return 'This action adds a new roomImage';
  }

  findAll() {
    return `This action returns all roomImage`;
  }

  findOne(id: number) {
    return `This action returns a #${id} roomImage`;
  }

  update(id: number, updateRoomImageDto: UpdateRoomImageDto) {
    return `This action updates a #${id} roomImage`;
  }

  remove(id: number) {
    return `This action removes a #${id} roomImage`;
  }
}
