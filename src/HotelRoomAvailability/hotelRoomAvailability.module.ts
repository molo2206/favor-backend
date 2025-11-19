import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomAvailabilityService } from './room-availability.service';
import { RoomAvailability } from './entity/RoomAvailability.entity';
import { Product } from 'src/products/entities/product.entity';
import { Reservation } from './entity/Reservation.entity';
import { UserEntity } from 'src/users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RoomAvailability, Product, Reservation, UserEntity])],
  providers: [RoomAvailabilityService],
  exports: [RoomAvailabilityService],
})
export class RoomAvailabilityModule {}
