import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RentalContractService } from './rental-contract.service';
import { RentalContractController } from './rental-contract.controller';
import { RentalContract } from './entities/rental-contract.entity';
import { Product } from 'src/products/entities/product.entity';
import { InvoiceService } from 'src/order/invoice/invoice.util';

@Module({
  imports: [TypeOrmModule.forFeature([RentalContract, Product])],
  controllers: [RentalContractController],
  providers: [RentalContractService, InvoiceService],
  exports: [RentalContractService],
})
export class RentalContractModule {}
