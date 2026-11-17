// src/backup/backup.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BackupService } from './backup.service';
import { BackupController } from './backup.controller';
import { BackupSchedule } from './entities/backup-schedule.entity';
import { BackupRun } from './entities/backup-run.entity';
import { BackupDatabase } from './entities/backup-database.entity';
import { BackupRestore } from './entities/backup-restore.entity';
import { BackupRestoreService } from './backup-restore.service';

/** ✅ Sauvegardes automatiques programmables + restauration / import / copie de bases (ScheduleModule.forRoot() est déjà chargé dans AppModule) */
@Module({
  imports: [TypeOrmModule.forFeature([BackupSchedule, BackupRun, BackupDatabase, BackupRestore])],
  providers: [BackupService, BackupRestoreService],
  controllers: [BackupController],
  exports: [BackupService, BackupRestoreService],
})
export class BackupModule {}
