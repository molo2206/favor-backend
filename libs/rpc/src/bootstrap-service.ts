import { INestMicroservice, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { rabbitUrls } from '@favor/contracts';
import { AllRpcExceptionsFilter } from './rpc-exception.filter';

/** Démarre un microservice RabbitMQ (file durable, acquittement manuel, 1 message à la fois par défaut) */
export async function bootstrapRmqService(module: any, queue: string, name: string): Promise<INestMicroservice> {
  require('dotenv').config();
  const logger = new Logger(name);
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(module, {
    transport: Transport.RMQ,
    options: {
      urls: rabbitUrls(),
      queue,
      queueOptions: { durable: true },
      noAck: false,
      prefetchCount: Number(process.env.RMQ_PREFETCH || 10),
    },
  });
  app.useGlobalFilters(new AllRpcExceptionsFilter());
  app.enableShutdownHooks();
  await app.listen();
  logger.log(`${name} à l'écoute sur la file RabbitMQ « ${queue} »`);
  return app;
}
