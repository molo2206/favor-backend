import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEntity } from './entities/activity.entity';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';
import { UserEntity } from 'src/users/entities/user.entity';
import { ProspectEntity } from '../prospects/entities/prospect.entity';
import { CustomerEntity } from '../customers/entities/customer.entity';
import { I18nService } from 'src/libs/common/src';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ActivityEntity,
            UserEntity,
            ProspectEntity,
            CustomerEntity,
        ]),
    ],
    controllers: [ActivitiesController],
    providers: [ActivitiesService, I18nService],
    exports: [ActivitiesService],
})
export class ActivitiesModule { }