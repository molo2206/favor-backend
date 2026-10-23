import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { Asset } from './entities/asset.entity';
import { AssetCategory } from './entities/asset-category.entity';
import { AssetMovement } from './entities/asset-movement.entity';
import { AssetService } from './asset.service';
import { AssetController } from './asset.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, AssetCategory, AssetMovement, BranchEntity, UserEntity])],
  controllers: [AssetController],
  providers: [AssetService],
  exports: [AssetService],
})
export class AssetModule { }
