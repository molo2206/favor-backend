import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TravelReservationEntity } from './entities/travel_reservation.entity';
import { TravelReservationController } from './travel_reservation.controller';
import { TravelReservationService } from './travel_reservation.service';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TravelReservationEntity]),
    UsersModule,
  ],
  providers: [TravelReservationService],
  controllers: [TravelReservationController],
})
export class TravelReservationModule { }
