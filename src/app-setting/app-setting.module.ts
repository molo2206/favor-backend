import { Module } from '@nestjs/common';
import { AppSettingService } from './app-setting.service';
import { AppSettingController } from './app-setting.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudinaryModule } from 'src/users/utility/helpers/cloudinary.module';
import { AppSettingEntity } from './entities/app-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AppSettingEntity]), CloudinaryModule],
  controllers: [AppSettingController],
  providers: [AppSettingService],
  exports: [AppSettingService],
})
export class AppSettingModule {}
