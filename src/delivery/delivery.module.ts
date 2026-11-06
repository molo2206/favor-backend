import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryEntity } from './entities/delivery.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { OrderEntity } from 'src/order/entities/order.entity';
import { TrackingEntity } from 'src/tracking/entities/tracking.entity';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeliveryEntity,
      CompanyEntity,
      UserEntity,
      OrderEntity,
      TrackingEntity,
    ]),
  ],
  controllers: [DeliveryController],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
