import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProspectEntity } from '../prospects/entities/prospect.entity';
import { CustomerEntity } from '../customers/entities/customer.entity';
import { OpportunityEntity } from '../opportunities/entities/opportunity.entity';
import { ContractEntity } from '../contracts/entities/contract.entity';
import { CommercialDashboardService } from './dashboard.service';
import { CommercialDashboardController } from './dashboard.controller';
import { QuotationEntity } from '../quotations/entities/quotation.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ProspectEntity,
            CustomerEntity,
            OpportunityEntity,
            QuotationEntity,
            ContractEntity,
        ]),
    ],
    controllers: [CommercialDashboardController],
    providers: [CommercialDashboardService],
})
export class DashboardModule { }