import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProspectEntity } from './entities/prospect.entity';
import { CustomerEntity } from '../customers/entities/customer.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { UserLoyaltyEntity } from 'src/users/entities/user-loyalty.entity';
import { ProspectsService } from './prospects.service';
import { ProspectsController } from './prospects.controller';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper'; // ✅ Import
import { I18nService } from 'src/libs/common/src';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ProspectEntity,
            CustomerEntity,
            UserEntity,
            CompanyEntity,
            BranchEntity,
            UserLoyaltyEntity,
        ]),
    ],
    controllers: [ProspectsController],
    providers: [
        ProspectsService,
        I18nService,
        SmsHelper,  // ✅ Ajouté
    ],
    exports: [ProspectsService],
})
export class ProspectsModule { }