import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomAvailability } from 'src/HotelRoomAvailability/entity/RoomAvailability.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { I18nService } from 'src/libs/common/src';
import { CompanyDashboardService } from './company-dashboard.service';
import { CompanyDashboardController } from './company-dashboard.controller';

/** ✅ Tableau de bord de l'entreprise active (par type d'entreprise) — lecture seule, aucune table ajoutée */
@Module({
  imports: [TypeOrmModule.forFeature([RoomAvailability, UserEntity])],
  providers: [CompanyDashboardService, I18nService],
  controllers: [CompanyDashboardController],
})
export class CompanyDashboardModule { }
