import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entités
import { AgentPaymentEntity } from './entities/agent-payment.entity';
import { PayrollRunEntity } from './entities/payroll-run.entity';
import { PayslipEntity } from './entities/payslip.entity';
import { PayslipLineEntity } from './entities/payslip-line.entity';
import { PayrollItemEntity } from './entities/payroll-item.entity';
import { EmployeePayrollItemEntity } from './entities/employee-payroll-item.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { DepartmentEntity } from '../departments/entities/department.entity';

// Services
import { AgentPaymentsService } from './services/agent-payments.service';
import { PayrollRunService } from './services/payroll-run.service';
import { PayslipService } from './services/payslip.service';
import { PayrollItemService } from './services/payroll-item.service';

// Contrôleurs
import { AgentPaymentsController } from './controllers/agent-payments.controller';
import { PayrollRunController } from './controllers/payroll-run.controller';
import { PayslipController } from './controllers/payslip.controller';
import { PayrollItemController } from './controllers/payroll-item.controller';

// ✅ Modules nécessaires
import { SmsModule } from 'src/users/utility/sms/sms.module';
import { FpayModule } from 'src/fpay/fpay.module';        // ✅ AJOUT

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentPaymentEntity,
      PayrollRunEntity,
      PayslipEntity,
      PayslipLineEntity,
      PayrollItemEntity,
      EmployeePayrollItemEntity,
      EmployeeEntity,
      DepartmentEntity,
    ]),
    SmsModule,      // ✅ Fournit SmsService + SmsQuotaService
    FpayModule,     // ✅ AJOUT — Fournit FpayService
  ],
  controllers: [
    AgentPaymentsController,
    PayrollRunController,
    PayslipController,
    PayrollItemController,
  ],
  providers: [
    AgentPaymentsService,
    PayrollRunService,
    PayslipService,
    PayrollItemService,
  ],
  exports: [
    AgentPaymentsService,
    PayrollRunService,
    PayslipService,
    PayrollItemService,
  ],
})
export class AgentPaymentsModule { }