import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomImageService } from './room-image.service';
import { RoomImageController } from './room-image.controller';
import { RoomImage } from './entities/room-image.entity';
import { Room } from 'src/room/entities/room.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RoomImage, Room])],
  controllers: [RoomImageController],
  providers: [RoomImageService],
  exports: [RoomImageService],
})
export class RoomImageModule {}
