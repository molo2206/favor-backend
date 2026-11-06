import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { requestLang, translateHardcodedMessage } from '../errors/message-translator';

/**
 * ✅ Traduit le champ « message » des réponses réussies quand il est écrit en dur dans le code
 * (ex. « Rôle créé avec succès ») selon la langue de la requête (fr, en, es, sw, ar).
 * Les messages déjà traduits par i18n ne sont pas touchés (ils ne sont pas dans le catalogue).
 */
@Injectable()
export class ResponseMessageInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    return next.handle().pipe(
      map((body) => {
        try {
          if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.isBuffer(body)) return body;
          if (typeof body.message !== 'string') return body;
          const translated = translateHardcodedMessage(body.message, requestLang(req));
          if (translated && translated !== body.message) body.message = translated;
        } catch {
          /* ne jamais casser une réponse */
        }
        return body;
      }),
    );
  }
}
