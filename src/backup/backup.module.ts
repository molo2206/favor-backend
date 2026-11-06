// src/backup/backup.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BackupService } from './backup.service';
import { BackupController } from './backup.controller';
import { BackupSchedule } from './entities/backup-schedule.entity';
import { BackupRun } from './entities/backup-run.entity';
import { BackupDatabase } from './entities/backup-database.entity';

/** ✅ Sauvegardes automatiques programmables (ScheduleModule.forRoot() est déjà chargé dans AppModule) */
@Module({
  imports: [TypeOrmModule.forFeature([BackupSchedule, BackupRun, BackupDatabase])],
  providers: [BackupService],
  controllers: [BackupController],
  exports: [BackupService],
})
export class BackupModule {}
