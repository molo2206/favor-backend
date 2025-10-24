// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { NestExpressApplication } from '@nestjs/platform-express';
// import { join } from 'path';
// import * as bodyParser from 'body-parser';
// import { ValidationPipe } from '@nestjs/common';

// async function bootstrap() {
//   const app = await NestFactory.create<NestExpressApplication>(AppModule);

//   // Autoriser les requêtes cross-origin (ex: depuis localhost:5173)
//   app.enableCors({
//     origin: ['http://localhost:5173', 'https://favor-help.vercel.app'],
//     credentials: true,
//   });
//   // Autorise les corps JSON et urlencodeds
//   app.use(bodyParser.json({ limit: '10mb' }));
//   app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

//   // Gérer les fichiers statiques (uploads/images etc.)
//   app.useStaticAssets(join(__dirname, '..', 'uploads/users'), {
//     prefix: '/uploads/users/',
//   });

//   // Préfixe global pour tes routes
//   app.setGlobalPrefix('api/v1');
//   app.useGlobalPipes(
//     new ValidationPipe({
//       transform: true, // Permet la conversion automatique des types
//       whitelist: true, // Ignore les propriétés non définies dans le DTO
//       forbidNonWhitelisted: true, // Lève une erreur si des propriétés non attendues sont envoyées
//     }),
//   );
//   await app.listen(3000);
// }
// bootstrap();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as bodyParser from 'body-parser';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'https://favor-help.vercel.app'],
    credentials: true,
  });

  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

  app.useStaticAssets(join(__dirname, '..', 'uploads/users'), {
    prefix: '/uploads/users/',
  });

  app.setGlobalPrefix('api/v1');

  // ✅ VALIDATION SIMPLIFIÉE
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: false,
      forbidNonWhitelisted: false,
    }),
  );

  await app.listen(3000);
}
bootstrap();
