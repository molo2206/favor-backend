import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { AUDIT_KEY, AUDIT_SKIP_KEY } from '../decorator/audit.decorator';
import { currentAudit } from '../context/audit-context';

/**
 * ✅ Complète le contexte d'audit de la requête (route, action déclarée, réponse, erreur).
 * L'écriture se fait à la fin de la réponse (AuditContextMiddleware) : l'auteur est l'utilisateur connecté
 * (et non plus un champ de la réponse), les échecs sont aussi enregistrés, et une erreur d'audit
 * ne bloque jamais la requête.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();
    const store = currentAudit();
    if (!store) return next.handle();

    try {
      const targets = [context.getHandler(), context.getClass()];
      store.meta = this.reflector.getAllAndOverride(AUDIT_KEY, targets) ?? null;
      store.skip = !!this.reflector.getAllAndOverride(AUDIT_SKIP_KEY, targets);
      store.controllerPath = Reflect.getMetadata('path', context.getClass()) ?? null;
      store.handlerName = context.getHandler()?.name ?? null;
      const req = context.switchToHttp().getRequest();
      store.params = req?.params ? { ...req.params } : null;
      store.routePath = req?.route?.path ?? null;
    } catch {
      /* l'audit ne doit jamais bloquer */
    }

    return next.handle().pipe(
      tap((response) => {
        store.response = response;
      }),
      catchError((err) => {
        store.error = {
          status: typeof err?.getStatus === 'function' ? err.getStatus() : err?.status,
          code: err?.response?.code ?? err?.code,
          message: String(err?.response?.message ?? err?.message ?? 'Erreur').slice(0, 1000),
        };
        return throwError(() => err);
      }),
    );
  }
}
