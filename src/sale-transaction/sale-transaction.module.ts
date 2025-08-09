import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SaleTransactionService } from './sale-transaction.service';
import { SaleTransactionController } from './sale-transaction.controller';
import { SaleTransaction } from './entities/sale-transaction.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { Product } from 'src/products/entities/product.entity';
import { InvoiceService } from 'src/order/invoice/invoice.util';

@Module({
  imports: [TypeOrmModule.forFeature([SaleTransaction, UserEntity, Product])],
  controllers: [SaleTransactionController],
  providers: [SaleTransactionService,InvoiceService],
  exports: [SaleTransactionService],
})
export class SaleTransactionModule {}
