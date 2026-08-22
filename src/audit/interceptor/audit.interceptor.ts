import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../audit.service';
import { AUDIT_KEY } from '../decorator/audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditMeta = this.reflector.get(AUDIT_KEY, context.getHandler());
    if (!auditMeta) return next.handle();

    return next.handle().pipe(
      tap(async (response) => {
        const entityData = response?.data || response;
        
        if (!entityData) return;

        // Récupérer userId depuis les données
        const userId = entityData.userId || entityData.user?.id || null;

        // ✅ Appel correct - log() retourne Promise<AuditLog>
        const savedAudit = await this.auditService.log({
          userId: userId,
          action: auditMeta.action,
          entity: auditMeta.entity,
          entityId: entityData.id,
          newValue: entityData,
        });

        // ✅ Ici savedAudit est un AuditLog, pas un tableau
        console.log('Audit enregistré avec ID:', savedAudit.id, 'userId:', savedAudit.userId);
      }),
    );
  }
}
