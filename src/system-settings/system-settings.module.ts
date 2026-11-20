// src/system-settings/system-settings.module.ts
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSetting, SystemSettingHistory } from './system-setting.entity';
import { SystemSettingsService } from './system-settings.service';
import { SystemSettingsController } from './system-settings.controller';

/** ✅ Paramètres système : les clés du .env gérées depuis l'administration (table system_settings) */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SystemSetting, SystemSettingHistory])],
  providers: [SystemSettingsService],
  controllers: [SystemSettingsController],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
