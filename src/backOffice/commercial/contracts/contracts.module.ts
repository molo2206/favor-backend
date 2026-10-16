import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractEntity } from './entities/contract.entity';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { CustomerEntity } from '../customers/entities/customer.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { I18nService } from 'src/libs/common/src';

@Module({
    imports: [
        TypeOrmModule.forFeature([ContractEntity, CustomerEntity, UserEntity]),
    ],
    controllers: [ContractsController],
    providers: [ContractsService, I18nService],
    exports: [ContractsService],
})
export class ContractsModule { }