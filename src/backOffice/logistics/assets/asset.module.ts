import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { FilesModule } from 'src/files/files.module';
import { LogisticsImageService } from '../common/logistics-image.service';
import { Asset } from './entities/asset.entity';
import { AssetCategory } from './entities/asset-category.entity';
import { AssetMovement } from './entities/asset-movement.entity';
import { AssetAssignment } from './entities/asset-assignment.entity';
import { AssetService } from './asset.service';
import { AssetController } from './asset.controller';

@Module({
  imports: [
    FilesModule, // ✅ images des biens, catégories et mouvements
    TypeOrmModule.forFeature([Asset, AssetCategory, AssetMovement, AssetAssignment, BranchEntity, UserEntity]),
  ],
  controllers: [AssetController],
  providers: [AssetService, LogisticsImageService],
  exports: [AssetService, LogisticsImageService],
})
export class AssetModule { }
