import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { City } from 'src/company/entities/city.entity';
import { Country } from 'src/company/entities/country.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
// ✅ Briques existantes : notifications (WebSocket + base + push), fichiers, paiements FPay / Pawapay
import { NotificationsModule } from 'src/notification/notifications.module';
import { FilesModule } from 'src/files/files.module';
import { FpayModule } from 'src/fpay/fpay.module';
import { PawapayModule } from 'src/pawapay/pawapay.module';
// ✅ Les annonces sont des lignes de la table `products` (listingType = CLASSIFIED)
import { Product } from 'src/products/entities/product.entity';
import { ImageProductEntity } from 'src/products/entities/imageProduct.entity';
import { Brand } from 'src/products/entities/brand.entity';
import { ClassifiedPricingPlan } from './entities/classified-pricing-plan.entity';
import { ClassifiedPayment } from './entities/classified-payment.entity';
import { ClassifiedReport } from './entities/classified-report.entity';
import { ClassifiedCommonService } from './services/classified-common.service';
import { ClassifiedPricingService } from './services/classified-pricing.service';
import { ClassifiedService } from './services/classified.service';
import { ClassifiedPaymentService } from './services/classified-payment.service';
import { ClassifiedAdminService } from './services/classified-admin.service';
import { ClassifiedsPublicController } from './classifieds-public.controller';
import { ClassifiedsController } from './classifieds.controller';
import { ClassifiedsAdminController } from './classifieds-admin.controller';

/** Annonces type Jiji dans la table `products` : publication payante par tous les utilisateurs, tarifs dynamiques par ville */
@Module({
  imports: [
    NotificationsModule,
    FilesModule,
    FpayModule,
    PawapayModule,
    TypeOrmModule.forFeature([
      Product,
      ImageProductEntity,
      Brand,
      ClassifiedPricingPlan,
      ClassifiedPayment,
      ClassifiedReport,
      UserEntity,
      City,
      Country,
      CategoryEntity,
    ]),
  ],
  // ⚠️ Le contrôleur public est déclaré en premier : /classifieds/public/... avant /classifieds/:id
  controllers: [ClassifiedsPublicController, ClassifiedsController, ClassifiedsAdminController],
  providers: [ClassifiedCommonService, ClassifiedPricingService, ClassifiedService, ClassifiedPaymentService, ClassifiedAdminService],
  exports: [ClassifiedService, ClassifiedPricingService],
})
export class ClassifiedsModule { }
