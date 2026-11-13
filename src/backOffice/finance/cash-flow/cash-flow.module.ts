import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { FilesModule } from 'src/files/files.module';
import { NotificationsModule } from 'src/notification/notifications.module';
import { LogisticsImageService } from 'src/backOffice/logistics/common/logistics-image.service';
import { CashFlowAccessService } from './common/cash-flow-access.service';
import { CashAccount } from './entities/cash-account.entity';
import { CashCategory } from './entities/cash-category.entity';
import { CashTransaction } from './entities/cash-transaction.entity';
import { CashTransfer } from './entities/cash-transfer.entity';
import { CashForecast } from './entities/cash-forecast.entity';
import { CashClosing } from './entities/cash-closing.entity';
import { FinanceMember } from './entities/finance-member.entity';
import { CashApprovalRule } from './entities/cash-approval-rule.entity';
import { CashApproval, CashApprovalStep } from './entities/cash-approval.entity';
import { CashApprovalService } from './cash-approval.service';
import { CashApprovalController } from './cash-approval.controller';
import { CashFlowService } from './cash-flow.service';
import { CashFlowReportService } from './cash-flow-report.service';
import { CashFlowController } from './cash-flow.controller';

/** ✅ Trésorerie (cash flow) : comptes, mouvements, transferts, prévisions, arrêtés de caisse, rapports, circuit de validation */
@Module({
  imports: [
    FilesModule, // justificatifs (reçus, factures)
    NotificationsModule,
    TypeOrmModule.forFeature([CashAccount, CashCategory, CashTransaction, CashTransfer, CashForecast, CashClosing, FinanceMember, BranchEntity, CashApprovalRule, CashApproval, CashApprovalStep]),
  ],
  controllers: [CashFlowController, CashApprovalController],
  providers: [CashFlowAccessService, CashFlowService, CashFlowReportService, LogisticsImageService, CashApprovalService],
  exports: [CashFlowService, CashFlowAccessService, CashApprovalService],
})
export class CashFlowModule { }
