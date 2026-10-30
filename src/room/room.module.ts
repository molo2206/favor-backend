import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomService } from './room.service';
import { RoomController } from './room.controller';
import { Room } from './entities/room.entity';
import { RoomImage } from 'src/room-image/entities/room-image.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { MeasureEntity } from 'src/measure/entities/measure.entity';
import { FilesModule } from 'src/files/files.module';

@Module({
  imports: [FilesModule, TypeOrmModule.forFeature([Room, CompanyEntity, MeasureEntity, RoomImage])],
  controllers: [RoomController],
  providers: [RoomService],
  exports: [RoomService],
})
export class RoomModule {}
