import { Module } from '@nestjs/common';
import { CashFlowModule } from './cash-flow/cash-flow.module';

/** BackOffice — Finance : trésorerie (cash flow) */
@Module({
  imports: [CashFlowModule],
  exports: [CashFlowModule],
})
export class FinanceModule { }
