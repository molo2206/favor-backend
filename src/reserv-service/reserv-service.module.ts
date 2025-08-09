import { Module } from '@nestjs/common';
import { ReservServiceService } from './reserv-service.service';
import { ReservServiceController } from './reserv-service.controller';

@Module({
  controllers: [ReservServiceController],
  providers: [ReservServiceService],
})
export class ReservServiceModule {}
