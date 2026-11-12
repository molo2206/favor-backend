import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerEntity } from './entities/customer.entity';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { I18nService } from 'src/libs/common/src';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            CustomerEntity,
            UserEntity,
            CompanyEntity,
            BranchEntity,
        ]),
    ],
    controllers: [CustomersController],
    providers: [CustomersService, I18nService],
    exports: [CustomersService],
})
export class CustomersModule { }