import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceZone } from './entity/ServiceZone.entity';
import { ServiceZonesController } from './service-zone.controller';
import { ServiceZonesService } from './service-zone.service';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceZone])],
  controllers: [ServiceZonesController],
  providers: [ServiceZonesService],
  exports: [ServiceZonesService],
})
export class ServiceZonesModule {}
