import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RideService } from './ride.service';
import { RideController } from './ride.controller';
import { Ride } from './entity/Ride.entity';
import { RideEvent } from './entity/RideEvent.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { City } from 'src/company/entities/city.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { NotificationsModule } from 'src/notification/notifications.module';
import { DriverLocationModule } from '../DriverLocation/driver-location.module';
import { I18nModule } from 'src/libs/common/src';
import { Pricing } from '../Pricing/entity/Pricing.entity';
import { DriverVehicle } from '../DriverVehicle/entity/DriverVehicle.entity';
// ✅ AJOUT : temps réel (WebSocket principal + Firebase), recherche de chauffeur, historique
import { RideRealtimeService } from './ride-realtime.service';
import { RideDispatchService } from './ride-dispatch.service';
import { RideHistoryService } from './ride-history.service';
import { RideGateway } from './ride.gateway';
// ✅ AJOUT : paiement des courses (Mobile Money, FPay, espèces, carte, virement, manuel)
import { RidePaymentService } from './ride-payment.service';
import { FpayModule } from 'src/fpay/fpay.module';
import { PawapayModule } from 'src/pawapay/pawapay.module';
// ✅ Devise choisie par le passager : conversion du prix serveur (exchange_rates)
import { RideCurrencyService } from './ride-currency.service';
import { ExchangeRateEntity } from 'src/Exchange/entities/exchange-rate.entity';
// ✅ Tableau de bord admin + commission des courses en espèces
import { RideAdminController } from './ride-admin.controller';
import { RideAdminDashboardService } from './ride-admin-dashboard.service';
import { RideCashCommissionService } from './ride-cash-commission.service';
import { DriverWalletMovement } from '../DriverCashout/entity/driver-wallet-movement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ride, RideEvent, UserEntity, City, CategoryEntity, Pricing, DriverVehicle, ExchangeRateEntity, DriverWalletMovement]),

    // Utiliser forwardRef pour casser la circular dependency
    // (fournit NotificationsGateway, NotificationsService, FcmService, PresenceService, WsAuthHelper)
    forwardRef(() => NotificationsModule),
    DriverLocationModule,
    I18nModule,
    forwardRef(() => FpayModule),
    PawapayModule,
  ],
  controllers: [RideController, RideAdminController],
  providers: [
    RideService,
    RideRealtimeService,
    RideDispatchService,
    RideHistoryService,
    RideGateway,
    RidePaymentService,
    RideCurrencyService,
    RideAdminDashboardService,
    RideCashCommissionService,
  ],
  exports: [RideService, RideRealtimeService, RidePaymentService, RideCurrencyService, RideCashCommissionService],
})
export class RideModule {}
