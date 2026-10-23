// src/contracts/contracts.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractEntity } from './entities/contract.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { ProspectEntity } from '../prospects/entities/prospect.entity';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { I18nService } from 'src/libs/common/src';
import { FilesModule } from 'src/files/files.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ContractEntity,
            UserEntity,
            ProspectEntity,
            // ❌ CompanyEntity retiré
            // ❌ BranchEntity retiré
        ]),
        FilesModule,
    ],
    controllers: [ContractsController],
    providers: [ContractsService, I18nService],
    exports: [ContractsService],
})
export class ContractsModule {}