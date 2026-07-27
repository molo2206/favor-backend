// invoice.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceService } from './invoice.util';
import { OrderEntity } from '../entities/order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity]), // ✅ Ajouter cette ligne
  ],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule { }