import { ArgumentsHost, Catch, HttpException, Logger, RpcExceptionFilter } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';
import { RpcErrorPayload } from '@favor/contracts';

/**
 * ✅ Côté microservice : toute erreur → { status, response } (même contenu que l'exception HTTP de l'application actuelle).
 * L'api-gateway la retransforme en réponse HTTP avec le filtre d'erreurs habituel (format et traductions identiques).
 */
@Catch()
export class AllRpcExceptionsFilter implements RpcExceptionFilter<any> {
  private readonly logger = new Logger('RpcError');

  catch(exception: any, _host: ArgumentsHost): Observable<RpcErrorPayload> {
    let payload: RpcErrorPayload;
    if (exception instanceof HttpException) {
      payload = { status: exception.getStatus(), response: exception.getResponse() as any };
    } else if (exception instanceof RpcException) {
      const err: any = exception.getError();
      payload = typeof err === 'object' && err?.status ? err : { status: 500, response: { message: String(err) } };
    } else {
      this.logger.error(exception?.message ?? exception, exception?.stack);
      payload = { status: 500, response: { message: 'Internal server error' } };
    }
    return throwError(() => payload);
  }
}
