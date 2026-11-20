// src/common/errors/process-error-handlers.ts
import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { I18nService } from 'src/libs/common/src';

const logger = new Logger('Process');

/**
 * Erreurs hors requête (promesses non attendues, callbacks, timers...).
 * Sans ces handlers, une seule erreur oubliée peut arrêter tout le serveur.
 *
 * PROCESS_EXIT_ON_UNCAUGHT=true → le processus s'arrête après une exception non
 * interceptée (à utiliser avec PM2 / Docker qui le redémarre automatiquement).
 */
export function registerProcessErrorHandlers(): void {
  process.on('unhandledRejection', (reason: any) => {
    logger.error(
      `Promesse rejetée non gérée : ${reason?.message ?? String(reason)}`,
      reason?.stack,
    );
  });

  process.on('uncaughtException', (error: any) => {
    logger.error(`Exception non interceptée : ${error?.message ?? String(error)}`, error?.stack);

    const fatal =
      process.env.PROCESS_EXIT_ON_UNCAUGHT === 'true' ||
      error?.code === 'ERR_INTERNAL_ASSERTION' ||
      error?.code === 'EADDRINUSE';

    if (fatal) {
      logger.error('Arrêt du processus (erreur fatale) : le gestionnaire de processus le redémarrera.');
      setTimeout(() => process.exit(1), 500).unref();
    }
  });

  process.on('warning', (warning) => {
    logger.warn(`${warning.name} : ${warning.message}`);
  });
}

/**
 * Middleware Express d'erreur placé juste après body-parser :
 * JSON invalide / corps trop gros → réponse JSON traduite (au lieu d'une page HTML).
 */
export function bodyParserErrorHandler(i18n: I18nService) {
  const supported = ['fr', 'en', 'es', 'sw', 'ar'];
  return (err: any, req: Request, res: Response, next: NextFunction) => {
    if (!err) return next();
    if (err.type !== 'entity.parse.failed' && err.type !== 'entity.too.large' && err.type !== 'encoding.unsupported') {
      return next(err);
    }

    const header = String(req.headers['x-lang'] ?? req.headers['accept-language'] ?? 'fr');
    const primary = header.split(',')[0].split(';')[0].trim().toLowerCase().slice(0, 2);
    const lang = supported.includes(primary) ? primary : 'fr';

    const status = err.type === 'entity.too.large' ? 413 : 400;
    const key =
      err.type === 'entity.too.large' ? 'errors.payload_too_large' : 'errors.json.invalid_body';

    logger.warn(`${req.method} ${req.originalUrl} → ${status} ${err.type}`);
    if (res.headersSent) return;
    res.status(status).json({
      statusCode: status,
      error: status === 413 ? 'Payload Too Large' : 'Bad Request',
      code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
      message: i18n.translate(key, lang),
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
  };
}
