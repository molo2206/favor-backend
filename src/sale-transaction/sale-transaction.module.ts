import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SaleTransactionService } from './sale-transaction.service';
import { SaleTransactionController } from './sale-transaction.controller';
import { SaleTransaction } from './entities/sale-transaction.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { Product } from 'src/products/entities/product.entity';
import { InvoiceService } from 'src/order/invoice/invoice.util';
import { MailModule } from 'src/email/email.module';
import { InvoiceModule } from 'src/order/invoice/invoice.module';
import { PdfModule } from 'src/pdf/pdf.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SaleTransaction, UserEntity, Product]),
    MailModule,
    InvoiceModule,
    PdfModule,
  ],
  controllers: [SaleTransactionController],
  providers: [SaleTransactionService, InvoiceService],
  exports: [SaleTransactionService],
})
export class SaleTransactionModule {}
