import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PawapayService } from './pawapay.service';
import { PawapayController } from './pawapay.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NetworkProvider } from './entity/network-provider.entity';
import { CountryProvider } from './entity/country-provider.entity';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([CountryProvider, NetworkProvider]), 
  ],
  providers: [PawapayService],
  controllers: [PawapayController],
  exports: [PawapayService],
})
export class PawapayModule {}
