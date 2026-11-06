// src/work-schedules/work-schedules.module.ts
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkSchedule, WorkScheduleException, WorkScheduleSlot } from './work-schedule.entity';
import { WorkSchedulesService } from './work-schedules.service';
import { WorkSchedulesController } from './work-schedules.controller';

/**
 * ✅ Horaires et programmes de travail — module global
 *    (utilisé par UsersService à l'émission des jetons et par CurrentUserMiddleware à chaque requête)
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([WorkSchedule, WorkScheduleSlot, WorkScheduleException])],
  controllers: [WorkSchedulesController],
  providers: [WorkSchedulesService],
  exports: [WorkSchedulesService],
})
export class WorkSchedulesModule {}
