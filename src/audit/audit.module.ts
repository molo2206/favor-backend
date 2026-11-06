// src/audit/audit.module.ts
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditLog } from './entity/audit-log.entity';
import { AuditController } from './audit.controller';
import { AuditSubscriber } from './audit.subscriber';
import { AuditContextMiddleware } from './context/audit-context.middleware';

/**
 * ✅ Module global : AuditService est injectable partout sans import
 * (this.audit.record(...) / this.audit.annotate(...)).
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditController],
  providers: [AuditService, AuditSubscriber, AuditContextMiddleware],
  exports: [AuditService],
})
export class AuditModule {}
