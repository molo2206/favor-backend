import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressService } from './address.service';
import { Address } from './entity/address.entity';
import { Distance } from './entity/distance.entity';
import { Direction } from './entity/direction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Address,Distance,Direction])],
  providers: [AddressService],
  exports: [AddressService],
})
export class AddressModule {}