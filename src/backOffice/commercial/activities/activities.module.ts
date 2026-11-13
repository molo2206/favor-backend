import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';
import { ActivityEntity } from './entities/activity.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { ProspectEntity } from '../prospects/entities/prospect.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ActivityEntity,
            UserEntity,          // ✅ OBLIGATOIRE pour salesRep + customer
            ProspectEntity,      // ✅ pour prospect
            CompanyEntity,       // ✅ pour activeCompany (si pas en eager)
            BranchEntity,        // ✅ pour activeBranch
        ]),
    ],
    controllers: [ActivitiesController],
    providers: [ActivitiesService],
    exports: [ActivitiesService],
})
export class ActivitiesModule { }