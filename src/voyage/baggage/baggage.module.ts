// baggage.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaggageService } from './baggage.service';
import { BaggageController } from './baggage.controller';
import { Baggage } from './entities/baggage.entity';
import { ReservationVehicule } from '../reservations-vehicles/entities/reservations-vehicle.entity';
import { Trip } from '../trips/entities/trip.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { VehicleBaggageRule } from '../baggage-rules/entities/baggage-rule.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Baggage,              // ✅ Ajouté
      VehicleBaggageRule,   // ✅ Ajouté
      ReservationVehicule,  // ✅ Ajouté
      Trip,                 // ✅ Ajouté
      Vehicle,              // ✅ Ajouté
    ]),
  ],
  controllers: [BaggageController],
  providers: [BaggageService],
  exports: [BaggageService],
})
export class BaggageModule {}