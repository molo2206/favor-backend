import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RideService } from './ride.service';
import { RideController } from './ride.controller';
import { Ride } from './entity/Ride.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { City } from 'src/company/entities/city.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { NotificationsModule } from 'src/notification/notifications.module';
import { DriverLocationModule } from '../DriverLocation/driver-location.module';
import { I18nModule } from 'src/libs/common/src';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ride, UserEntity, City, CategoryEntity]),

    // Utiliser forwardRef pour casser la circular dependency
    forwardRef(() => NotificationsModule),
    DriverLocationModule,
    I18nModule
  ],
  controllers: [RideController],
  providers: [RideService],
  exports: [RideService],
})
export class RideModule {}
