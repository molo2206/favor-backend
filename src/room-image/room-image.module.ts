import { Module } from '@nestjs/common';
import { RoomImageService } from './room-image.service';
import { RoomImageController } from './room-image.controller';

@Module({
  controllers: [RoomImageController],
  providers: [RoomImageService],
})
export class RoomImageModule {}
