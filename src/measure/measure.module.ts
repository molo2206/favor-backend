import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeasureService } from './measure.service';
import { MeasureController } from './measure.controller';
import { MeasureEntity } from './entities/measure.entity';
import { CompanyEntity } from 'src/company/entities/company.entity'; 

@Module({
  imports: [
    TypeOrmModule.forFeature([MeasureEntity, CompanyEntity]), 
  ],
  controllers: [MeasureController],
  providers: [MeasureService],
})
export class MeasureModule { }
