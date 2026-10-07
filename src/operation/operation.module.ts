// src/operation/operation.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperationService } from './operation.service';
import { OperationController } from './operation.controller';
import { OperationEntity } from './entity/operation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([OperationEntity]),
  ],
  controllers: [OperationController],
  providers: [OperationService],
  exports: [OperationService],
})
export class OperationModule {}
