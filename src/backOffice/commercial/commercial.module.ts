import { Module } from '@nestjs/common';

// ============================================================
// 📦 SOUS-MODULES DU DOMAINE COMMERCIAL
// ============================================================
import { ProspectsModule } from './prospects/prospects.module';
import { CustomersModule } from './customers/customers.module';
import { ActivitiesModule } from './activities/activities.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { QuotationsModule } from './quotations/quotations.module';
import { ContractsModule } from './contracts/contracts.module';
import { CommissionsModule } from './commissions/commissions.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
    imports: [
        // 🎯 CRM — Acquisition
        ProspectsModule,
        CustomersModule,
        ActivitiesModule,
        OpportunitiesModule,
        QuotationsModule,
        ContractsModule,
        CommissionsModule,
        DashboardModule,
    ],

    exports: [
        ProspectsModule,
        CustomersModule,
        OpportunitiesModule,
        QuotationsModule,
        ContractsModule,
        CommissionsModule,
    ],
})
export class CommercialModule { }