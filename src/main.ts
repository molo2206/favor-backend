
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as express from 'express';
import { resolve } from 'path';
import { I18nService } from './libs/common/src';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { validationExceptionFactory } from './common/errors/validation-exception.factory';
import { SafeClassSerializerInterceptor } from './common/interceptors/safe-class-serializer.interceptor';
import {
  bodyParserErrorHandler,
  registerProcessErrorHandlers,
} from './common/errors/process-error-handlers';

dotenv.config();

// ✅ Erreurs hors requête (promesses oubliées...) : journalisées au lieu de tuer le serveur
registerProcessErrorHandlers();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  const HOST = '0.0.0.0';
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

  const UPLOAD_PATH: string =
    process.env.NODE_ENV === 'production'
      ? (process.env.UPLOAD_PATH_PROD ?? '')
      : (process.env.UPLOAD_PATH_LOCAL ?? '');

  if (!UPLOAD_PATH) {
    throw new Error('UPLOAD_PATH not defined');
  }

  logger.log(`Upload Path: ${UPLOAD_PATH}`);

  const i18n = app.get(I18nService);

  // ⚠️ AUCUNE CONFIGURATION CORS ICI
  // Ni app.enableCors(), ni middleware OPTIONS global

  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
  // ✅ JSON invalide / corps trop volumineux → réponse JSON traduite
  app.use(bodyParserErrorHandler(i18n));

  app.useStaticAssets(resolve(__dirname, '..', 'uploads/users'), {
    prefix: '/uploads/users/',
  });
  app.use('/uploads', express.static(UPLOAD_PATH));

  app.setGlobalPrefix('api/v1');

  // ✅ Validation : erreurs détaillées par champ, traduites par AllExceptionsFilter
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  // ✅ Sérialisation sécurisée : ne parcourt plus les objets HTTP natifs (res, socket, flux)
  //    → corrige le crash "this.removeListener is not a function" / ERR_INTERNAL_ASSERTION
  app.useGlobalInterceptors(new SafeClassSerializerInterceptor(app.get(Reflector)));

  // ✅ Toutes les erreurs → réponse JSON homogène et traduite (fr, en, es, sw, ar)
  app.useGlobalFilters(new AllExceptionsFilter(i18n));

  // ✅ Arrêt propre (SIGTERM / SIGINT) : connexions BDD et sockets fermées correctement
  app.enableShutdownHooks();

  await app.listen(PORT, HOST);
  logger.log(`Application démarrée sur http://localhost:${PORT}`);
}

bootstrap().catch((error) => {
  // Erreur au démarrage (BDD inaccessible, port occupé, variable manquante...)
  new Logger('Bootstrap').error(`Échec du démarrage : ${error?.message ?? error}`, error?.stack);
  process.exit(1);
});
