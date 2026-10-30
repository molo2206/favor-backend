import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuotationEntity } from './entities/quotation.entity';
import { QuotationItemEntity } from './entities/quotation-item.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { ProspectEntity } from '../prospects/entities/prospect.entity';
import { Product } from 'src/products/entities/product.entity';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';
import { I18nService } from 'src/libs/common/src';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            QuotationEntity,
            QuotationItemEntity,
            UserEntity,        // ✅ customer + salesRep
            ProspectEntity,    // ✅ prospect
            Product,           // ✅ pour quotation_items.product
            // ❌ CustomerEntity retiré
        ]),
    ],
    controllers: [QuotationsController],
    providers: [QuotationsService, I18nService],
    exports: [QuotationsService],
})
export class QuotationsModule {}