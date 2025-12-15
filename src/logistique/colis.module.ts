import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ColisEntity } from './entity/colis.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { ColisService } from './colis.service';
import { ColisController } from './colis.controller';
@Module({
  imports: [TypeOrmModule.forFeature([ColisEntity, UserEntity])],
  providers: [ColisService],
  controllers: [ColisController],
})
export class ColisModule {}
