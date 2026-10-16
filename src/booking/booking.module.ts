import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { Booking } from './entities/booking.entity';
import { Room } from 'src/room/entities/room.entity';
import { UserEntity } from 'src/users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Room, UserEntity]),
  ],
  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingModule {}
