import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Autoriser les requêtes cross-origin (ex: depuis localhost:5173)
  app.enableCors({
    origin: ['http://localhost:5173'], // liste des URLs autorisées
    credentials: true, // si tu utilises des cookies ou Authorization headers
  });

  // Autorise les corps JSON et urlencoded
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

  // Gérer les fichiers statiques (uploads/images etc.)
  app.useStaticAssets(join(__dirname, '..', 'uploads/users'), {
    prefix: '/uploads/users/',
  });

  // Préfixe global pour tes routes
  app.setGlobalPrefix('api/v1');

  await app.listen(3000);
}
bootstrap();
