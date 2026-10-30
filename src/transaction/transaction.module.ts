import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionService } from './transaction.service';
import { TransactionEntity } from './entities/transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionEntity])],
  providers: [TransactionService],
  exports: [TypeOrmModule], // ✅ Exporte TypeOrmModule pour rendre le repository disponible
})
export class TransactionModule {}
