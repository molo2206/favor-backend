// address-user.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressUser } from './entities/address-user.entity';
import { AddressUserService } from './address-user.service';
import { AddressUserController } from './address-user.controller';
import { UserEntity } from 'src/users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AddressUser, UserEntity]), // 👈 Ajoute les entités ici
  ],
  controllers: [AddressUserController],
  providers: [AddressUserService],
  exports: [AddressUserService],
})
export class AddressUserModule {}
