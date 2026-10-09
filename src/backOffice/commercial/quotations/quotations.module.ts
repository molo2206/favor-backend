import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuotationEntity } from './entities/quotation.entity';
import { QuotationItemEntity } from './entities/quotation-item.entity';
import { CustomerEntity } from '../customers/entities/customer.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { Product } from 'src/products/entities/product.entity';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';
import { I18nService } from 'src/libs/common/src';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            QuotationEntity,
            QuotationItemEntity,
            CustomerEntity,
            UserEntity,
            Product,
        ]),
    ],
    controllers: [QuotationsController],
    providers: [QuotationsService, I18nService],
    exports: [QuotationsService],
})
export class QuotationsModule { }