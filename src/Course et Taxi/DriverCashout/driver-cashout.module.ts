import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { FpayModule } from 'src/fpay/fpay.module';
import { I18nModule } from 'src/libs/common/src';
import { Ride } from '../Ride/entity/Ride.entity';
import { RideModule } from '../Ride/ride.module';
import { DriverCashout } from './entity/driver-cashout.entity';
import { DriverWallet } from './entity/driver-wallet.entity';
import { DriverWalletMovement } from './entity/driver-wallet-movement.entity';
import { DriverCashoutService } from './driver-cashout.service';
import { DriverCashoutController } from './driver-cashout.controller';

/**
 * ✅ Retrait des gains des chauffeurs via F-Pay (route taxi/driver/cashout).
 * Réutilise FpayService (FpayModule) — aucune nouvelle intégration F-Pay.
 * UserPaymentMethodsService est fourni par UserPaymentMethodsModule (global).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DriverCashout, DriverWallet, DriverWalletMovement, Ride, UserEntity]),
    forwardRef(() => FpayModule),
    forwardRef(() => RideModule), // RideRealtimeService (notifications au chauffeur)
    I18nModule,
  ],
  controllers: [DriverCashoutController],
  providers: [DriverCashoutService],
  exports: [DriverCashoutService],
})
export class DriverCashoutModule { }
