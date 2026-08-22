import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';
import { PlatformEntity } from './entities/plateforms.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PlatformEntity])],
  providers: [PlatformService],
  controllers: [PlatformController],
  exports: [PlatformService],
})
export class PlatformModule {}
