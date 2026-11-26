import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryModule } from 'src/inventory/inventory.module';
import { PosTerminal } from './entities/pos-terminal.entity';
import { PosSession } from './entities/pos-session.entity';
import { PosSale } from './entities/pos-sale.entity';
import { PosSaleItem } from './entities/pos-sale-item.entity';
import { PosSalePayment } from './entities/pos-sale-payment.entity';
import { PosSyncOperation } from './entities/pos-sync-operation.entity';
import { PosService } from './pos.service';
import { PosSyncService } from './pos-sync.service';
import { PosController } from './pos.controller';

/**
 * Point de vente (caisse) + synchro offline.
 * Importe InventoryModule pour réutiliser InventoryService (sorties de stock)
 * et CompanyCapabilitiesService (capacités par type).
 */
@Module({
  imports: [
    InventoryModule,
    TypeOrmModule.forFeature([PosTerminal, PosSession, PosSale, PosSaleItem, PosSalePayment, PosSyncOperation]),
  ],
  controllers: [PosController],
  providers: [PosService, PosSyncService],
  exports: [PosService, PosSyncService],
})
export class PosModule {}
