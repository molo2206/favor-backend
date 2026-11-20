import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PickupTariffEntity } from './entities/pickup-tariff.entity';
import { PickupTariffTierEntity } from './entities/pickup-tariff-tier.entity';
import { PickupTariffController } from './pickup-tariff.controller';
import { PickupTariffService } from './pickup-tariff.service';
import { Country } from 'src/company/entities/country.entity';
import { City } from 'src/company/entities/city.entity';

/**
 * ✅ Module INDÉPENDANT — Tarifs de ramassage de colis par pays/ville,
 *    avec paliers dynamiques (1–10 = 2$, 11–20 = 3$, …).
 */
@Module({
  imports: [TypeOrmModule.forFeature([PickupTariffEntity, PickupTariffTierEntity, Country, City])],
  controllers: [PickupTariffController],
  providers: [PickupTariffService],
  exports: [PickupTariffService],
})
export class PickupTariffModule {}
