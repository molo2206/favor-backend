import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supply } from './entities/supply.entity';
import { SupplyHistory } from './entities/supply-history.entity';
import { SupplyHistoryService } from './supply-history.service';
import { SupplyHistorySubscriber } from './supply-history.subscriber';

/**
 * Noyau du Supply : historique + écoute automatique des shipments, LTA et commandes.
 * Sans contrôleur et sans dépendance vers les autres modules (pas de dépendance circulaire).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Supply, SupplyHistory])],
  providers: [SupplyHistoryService, SupplyHistorySubscriber],
  exports: [SupplyHistoryService],
})
export class SupplyCoreModule { }
