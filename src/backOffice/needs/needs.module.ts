import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from 'src/files/files.module';
import { NotificationsModule } from 'src/notification/notifications.module';
import { CashFlowModule } from 'src/backOffice/finance/cash-flow/cash-flow.module';
import { NeedsAccessService } from './common/needs-access.service';
import { NeedAttachment, NeedDisbursement, NeedItem, NeedLog, NeedRequest } from './entities/need.entity';
import { NeedMember, NeedRule } from './entities/need-config.entity';
import { NeedsWorkflowService } from './needs-workflow.service';
import { NeedsService } from './needs.service';
import { NeedsReportService } from './needs-report.service';
import { NeedsConfigService } from './needs-config.service';
import { NeedsController } from './needs.controller';

/**
 * ✅ BackOffice — ÉTATS DE BESOINS : demande de l'agent → validation hiérarchique séquentielle
 * (niveaux configurables, appels + relances) → service financier (autorisation, décaissements,
 * lien Trésorerie) → exécution. Historique complet non modifiable, tableau de bord, exports Excel / PDF.
 */
@Module({
  imports: [
    FilesModule,
    NotificationsModule,
    CashFlowModule, // sorties de caisse (décaissements)
    TypeOrmModule.forFeature([NeedRequest, NeedItem, NeedAttachment, NeedDisbursement, NeedLog, NeedRule, NeedMember]),
  ],
  controllers: [NeedsController],
  providers: [NeedsAccessService, NeedsWorkflowService, NeedsService, NeedsReportService, NeedsConfigService],
  exports: [NeedsService, NeedsWorkflowService],
})
export class NeedsModule { }
