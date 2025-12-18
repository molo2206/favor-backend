import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ColisEntity } from './entity/colis.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { ColisService } from './colis.service';
import { ColisController } from './colis.controller';
import { ColisTrackingEntity } from './entity/colis-tracking.entity';
@Module({
  imports: [TypeOrmModule.forFeature([ColisTrackingEntity,ColisEntity, UserEntity])],
  providers: [ColisService],
  controllers: [ColisController],
})
export class ColisModule {}
