import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { rewriteMediaUrlsDeep } from '../../files/media-url.util';

/**
 * ✅ Masque l'URL de l'API dans les liens de fichiers :
 * tout ancien lien « https://api-prod.../uploads/xxx » présent dans une réponse
 * est réécrit en « MEDIA_BASE_URL/xxx » (données déjà en base, anciens enregistrements…).
 * Sans effet si MEDIA_BASE_URL n'est pas défini.
 */
@Injectable()
export class MediaUrlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();
    return next.handle().pipe(
      map((body) => {
        try {
          return rewriteMediaUrlsDeep(body);
        } catch {
          return body; // ne jamais casser une réponse
        }
      }),
    );
  }
}
