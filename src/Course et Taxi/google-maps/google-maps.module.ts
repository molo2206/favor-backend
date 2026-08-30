import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GoogleService } from './google-maps.service';
import { GoogleMapsController } from './google-maps.controller';
import { AddressModule } from './address/address.module';
import { SearchHistoryModule } from './address/search-history.module';

@Module({
  imports: [HttpModule,AddressModule,SearchHistoryModule],
  controllers: [GoogleMapsController],
  providers: [GoogleService],
  exports: [GoogleService],
})
export class GoogleModule {}
