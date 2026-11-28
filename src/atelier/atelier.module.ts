import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { AtelierSizeTierEntity } from './entities/atelier-size-tier.entity';
import { AtelierCommissionEntity } from './entities/atelier-commission.entity';
import { AtelierOrderChargeEntity } from './entities/atelier-order-charge.entity';
import { AtelierService } from './atelier.service';
import { AtelierController } from './atelier.controller';
import { AtelierAdminController } from './atelier-admin.controller';

/**
 * 🧵 Module Atelier de couture : prix par taille (paliers) + commission plateforme.
 * Additif : n'altère pas le flux commande existant. Le service est exporté pour être
 * appelé par le module Order au moment du paiement (enregistrement de la répartition).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AtelierSizeTierEntity,
      AtelierCommissionEntity,
      AtelierOrderChargeEntity,
      CompanyEntity,
    ]),
  ],
  controllers: [AtelierController, AtelierAdminController],
  providers: [AtelierService],
  exports: [AtelierService],
})
export class AtelierModule {}
