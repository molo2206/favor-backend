import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PositionEntity } from './entities/position.entity';
import { PositionService } from './position.service';
import { PositionController } from './position.controller';
import { CommonModule } from 'src/libs/common/src/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PositionEntity]),
    CommonModule, // pour I18nService
  ],
  controllers: [PositionController],
  providers: [PositionService],
  exports: [PositionService, TypeOrmModule],
})
export class PositionModule {}