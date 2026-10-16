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
import { I18nService } from 'src/libs/common/src';
import { SmsModule } from 'src/users/utility/sms/sms.module';

// ✅ Import du module SMS (au lieu de SmsHelper directement)

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
        SmsModule, // ✅ Import du module (fournit SmsService)
    ],
    controllers: [ProspectsController],
    providers: [
        ProspectsService,
        I18nService,
        // ❌ SmsHelper retiré
    ],
    exports: [ProspectsService],
})
export class ProspectsModule { }