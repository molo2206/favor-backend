import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockLocation } from './entities/stock-location.entity';
import { StockItem } from './entities/stock-item.entity';
import { StockLot } from './entities/stock-lot.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { ProductPharmaMeta } from './entities/product-pharma-meta.entity';
import { TypeCompanyConfig } from './capabilities/type-company-config.entity';
import { CompanyCapabilitiesService } from './capabilities/company-capabilities.service';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

/**
 * Inventaire avancé + capacités par type d'entreprise (socle du POS et de la synchro offline).
 * I18nService est global (I18nModule @Global), pas besoin de l'importer.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockLocation,
      StockItem,
      StockLot,
      StockMovement,
      ProductPharmaMeta,
      TypeCompanyConfig,
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService, CompanyCapabilitiesService],
  // Exportés pour le futur module POS et le module de synchro offline
  exports: [InventoryService, CompanyCapabilitiesService],
})
export class InventoryModule {}
