import { Module } from '@nestjs/common';
import { AppSettingService } from './app-setting.service';
import { AppSettingController } from './app-setting.controller';
import { AppSetting } from './entities/app-setting.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudinaryModule } from 'src/users/utility/helpers/cloudinary.module';

@Module({
  imports: [TypeOrmModule.forFeature([AppSetting]), CloudinaryModule],
  controllers: [AppSettingController],
  providers: [AppSettingService],
  exports: [AppSettingService],
})
export class AppSettingModule {}
