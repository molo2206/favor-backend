import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { databaseUrl } from './database-url';

/**
 * ✅ Accès à la base MySQL de PRODUCTION (la même que l'application actuelle).
 * Le schéma Prisma est LU depuis la base (prisma db pull) : aucune migration Prisma n'est jamais lancée.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  constructor() {
    super({ datasources: { db: { url: databaseUrl() } } });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connecté à MySQL');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
