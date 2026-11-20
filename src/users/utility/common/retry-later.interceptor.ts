import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class RetryLaterInterceptor implements NestInterceptor {
  private isMaintenance(): boolean {
    // Active via variable d'environnement
    return process.env.MAINTENANCE_MODE === 'true';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (this.isMaintenance()) {
      const request = context.switchToHttp().getRequest();
      const method = request.method;

      // Bloquer toutes les méthodes (GET, POST, etc.) ou seulement les méthodes modifiantes
      const blockAllMethods = true; // mets false pour bloquer seulement POST/PUT/PATCH/DELETE

      if (blockAllMethods) {
        throw new HttpException(
          {
            message: 'Service en maintenance. Veuillez réessayer plus tard.',
            data: null,
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      } else {
        const modifyingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
        if (modifyingMethods.includes(method)) {
          throw new HttpException(
            {
              message:
                'Service temporairement indisponible. Veuillez réessayer plus tard.',
              data: null,
            },
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
      }
    }
    return next.handle();
  }
}
