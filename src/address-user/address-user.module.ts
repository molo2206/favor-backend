// address-user.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressUser } from './entities/address-user.entity';
import { AddressUserService } from './address-user.service';
import { AddressUserController } from './address-user.controller';
import { UserEntity } from 'src/users/entities/user.entity';
import { Country } from 'src/company/entities/country.entity'; // ✅ Ajout
import { City } from 'src/company/entities/city.entity'; // ✅ Ajout

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AddressUser,
      UserEntity,
      Country, // ✅ Ajout de Country
      City,    // ✅ Ajout de City
    ]),
  ],
  controllers: [AddressUserController],
  providers: [AddressUserService],
  exports: [AddressUserService],
})
export class AddressUserModule {}