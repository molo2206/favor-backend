import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressService } from './address.service';
import { Address } from './entity/address.entity';
import { Distance } from './entity/distance.entity';
import { Direction } from './entity/direction.entity';
import { MapsApiCache } from './entity/maps-api-cache.entity';
import { MapsApiCacheService } from './maps-api-cache.service';

@Module({
  imports: [TypeOrmModule.forFeature([Address, Distance, Direction, MapsApiCache])],
  providers: [AddressService, MapsApiCacheService],
  exports: [AddressService, MapsApiCacheService],
})
export class AddressModule {}