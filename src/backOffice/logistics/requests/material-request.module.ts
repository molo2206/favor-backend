import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { NotificationsModule } from 'src/notification/notifications.module';
import { AssetModule } from '../assets/asset.module';
import { Asset } from '../assets/entities/asset.entity';
import { AssetCategory } from '../assets/entities/asset-category.entity';
import { AssetAssignment } from '../assets/entities/asset-assignment.entity';
import { MaterialRequest } from './entities/material-request.entity';
import { MaterialRequestItem } from './entities/material-request-item.entity';
import { LogisticsManager } from './entities/logistics-manager.entity';
import { MaterialRequestService } from './material-request.service';
import { MaterialRequestController } from './material-request.controller';

/** ✅ Demandes de matériel (demande → validation → sortie → remise) et logisticiens désignés */
@Module({
  imports: [
    AssetModule, // AssetService (remises) + LogisticsImageService
    NotificationsModule,
    TypeOrmModule.forFeature([MaterialRequest, MaterialRequestItem, LogisticsManager, Asset, AssetCategory, AssetAssignment, BranchEntity]),
  ],
  controllers: [MaterialRequestController],
  providers: [MaterialRequestService],
})
export class MaterialRequestModule { }
