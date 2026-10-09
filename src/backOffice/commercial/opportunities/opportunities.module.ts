import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpportunityEntity } from './entities/opportunity.entity';
import { CustomerEntity } from '../customers/entities/customer.entity';
import { ProspectEntity } from '../prospects/entities/prospect.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesController } from './opportunities.controller';
import { I18nService } from 'src/libs/common/src';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            OpportunityEntity,
            CustomerEntity,
            ProspectEntity,
            UserEntity,
        ]),
    ],
    controllers: [OpportunitiesController],
    providers: [OpportunitiesService, I18nService],
    exports: [OpportunitiesService],
})
export class OpportunitiesModule { }