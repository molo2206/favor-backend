// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';
// import { NestExpressApplication } from '@nestjs/platform-express';
// import * as bodyParser from 'body-parser';
// import { ValidationPipe } from '@nestjs/common';
// import * as dotenv from 'dotenv';
// import * as express from 'express';
// import { resolve } from 'path';

// dotenv.config();

// async function bootstrap() {
//   const app = await NestFactory.create<NestExpressApplication>(AppModule);

//   const HOST = '0.0.0.0';
//   const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

//   const UPLOAD_PATH: string =
//     process.env.NODE_ENV === 'production'
//       ? (process.env.UPLOAD_PATH_PROD ?? '')
//       : (process.env.UPLOAD_PATH_LOCAL ?? '');

//   if (!UPLOAD_PATH) {
//     throw new Error('UPLOAD_PATH not defined');
//   }

//   console.log('Upload Path:', UPLOAD_PATH);

//   // --------------------------------------------------------------
//   // 1. Middleware global pour répondre aux requêtes OPTIONS (préflight)
//   //    Ceci est crucial si votre backend est déployé sur Vercel (serverless)
//   //    ou si vous voulez garantir que toutes les OPTIONS soient traitées.
//   // --------------------------------------------------------------
//   app.use((req, res, next) => {
//     if (req.method === 'OPTIONS') {
//       const origin = req.headers.origin;
//       const allowedOrigins = [
//         'https://admin.favorhelp.com',
//         'https://favor-help.vercel.app',
//         'http://localhost:5173',
//         'http://localhost:3000',
//       ];
//       if (allowedOrigins.includes(origin)) {
//         res.setHeader('Access-Control-Allow-Origin', origin);
//       }
//       res.setHeader(
//         'Access-Control-Allow-Methods',
//         'GET, POST, PUT, DELETE, OPTIONS',
//       );
//       res.setHeader(
//         'Access-Control-Allow-Headers',
//         'Content-Type, Authorization, X-Requested-With, sid, EIO',
//       );
//       res.setHeader('Access-Control-Allow-Credentials', 'true');
//       return res.sendStatus(204); // No content
//     }
//     next();
//   });

//   // --------------------------------------------------------------
//   // 2. CORS pour les routes REST (API classique)
//   //    Ceci gère les en-têtes CORS pour toutes les autres routes.
//   // --------------------------------------------------------------
//   app.enableCors({
//     origin: [
//       'http://localhost:5173',
//       'http://localhost:3000',
//       'https://favor-help.vercel.app',
//       'https://admin.favorhelp.com',
//     ],
//     credentials: true,
//     methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
//   });

//   // Middlewares standard
//   app.use(bodyParser.json({ limit: '10mb' }));
//   app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

//   // Dossiers statiques
//   app.useStaticAssets(resolve(__dirname, '..', 'uploads/users'), {
//     prefix: '/uploads/users/',
//   });
//   app.use('/uploads', express.static(UPLOAD_PATH));

//   // Préfixe global et validation
//   app.setGlobalPrefix('api/v1');
//   app.useGlobalPipes(new ValidationPipe({ transform: true }));

//   // --------------------------------------------------------------
//   // 3. IMPORTANT : ne PAS utiliser app.useWebSocketAdapter()
//   //    NestJS utilise déjà l'IoAdapter par défaut.
//   //    Les paramètres CORS de Socket.IO sont dans le décorateur @WebSocketGateway.
//   // --------------------------------------------------------------

//   await app.listen(PORT, HOST);
//   console.log(`Application démarrée sur http://localhost:${PORT}`);
// }
// bootstrap();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as express from 'express';
import { resolve } from 'path';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const HOST = '0.0.0.0';
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 7000;

  const UPLOAD_PATH: string =
    process.env.NODE_ENV === 'production'
      ? (process.env.UPLOAD_PATH_PROD ?? '')
      : (process.env.UPLOAD_PATH_LOCAL ?? '');

  if (!UPLOAD_PATH) {
    throw new Error('UPLOAD_PATH not defined');
  }

  console.log('Upload Path:', UPLOAD_PATH);

  // ⚠️ AUCUNE CONFIGURATION CORS ICI
  // Ni app.enableCors(), ni middleware OPTIONS global
  
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

  app.useStaticAssets(resolve(__dirname, '..', 'uploads/users'), {
    prefix: '/uploads/users/',
  });
  app.use('/uploads', express.static(UPLOAD_PATH));

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  await app.listen(PORT, HOST);
  console.log(`Application démarrée sur http://localhost:${PORT}`);
}
bootstrap();
