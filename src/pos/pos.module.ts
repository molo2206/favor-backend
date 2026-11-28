import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryModule } from 'src/inventory/inventory.module';
import { ProductModule } from 'src/products/products.module';
import { PosTerminal } from './entities/pos-terminal.entity';
import { PosSession } from './entities/pos-session.entity';
import { PosSale } from './entities/pos-sale.entity';
import { PosSaleItem } from './entities/pos-sale-item.entity';
import { PosSalePayment } from './entities/pos-sale-payment.entity';
import { PosSyncOperation } from './entities/pos-sync-operation.entity';
import { PosCustomer } from './entities/pos-customer.entity';
import { PosService } from './pos.service';
import { PosSyncService } from './pos-sync.service';
import { PosCustomerService } from './pos-customer.service';
import { PosController } from './pos.controller';
import { PosCustomerController } from './pos-customer.controller';

/**
 * Point de vente (caisse) + synchro offline.
 * Importe InventoryModule pour réutiliser InventoryService (sorties de stock)
 * et CompanyCapabilitiesService (capacités par type).
 */
@Module({
  imports: [
    InventoryModule,
    ProductModule,
    TypeOrmModule.forFeature([PosTerminal, PosSession, PosSale, PosSaleItem, PosSalePayment, PosSyncOperation, PosCustomer]),
  ],
  controllers: [PosController, PosCustomerController],
  providers: [PosService, PosSyncService, PosCustomerService],
  exports: [PosService, PosSyncService, PosCustomerService],
})
export class PosModule {}
