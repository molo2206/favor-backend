// src/audit/audit.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entity/audit-log.entity';

// audit.service.ts
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(data: {
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    oldValue?: any;
    newValue?: any;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<AuditLog> {
    
    // Créer une instance simple
    const auditLog = new AuditLog();
    Object.assign(auditLog, {
      userId: data.userId ?? null,
      action: data.action,
      entity: data.entity,
      entityId: data.entityId ?? null,
      oldValue: data.oldValue,
      newValue: data.newValue,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
    });

    console.log('[AuditService] Enregistrement audit avec userId:', auditLog.userId);

    // Sauvegarder directement
    return await this.auditLogRepository.save(auditLog);
  }
}