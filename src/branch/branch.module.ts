import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchEntity } from './entity/branch.entity';
import { BranchService } from './branch.service';
import { BranchController } from './branch.controller';
import { Country } from 'src/company/entities/country.entity';
import { City } from 'src/company/entities/city.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BranchEntity, Country, City])],
  controllers: [BranchController],
  providers: [BranchService],
  exports: [BranchService],
})
export class BranchModule {}
