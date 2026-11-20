import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { I18nService } from 'src/libs/common/src';
import { CensusRecordEntity } from './entities/census-record.entity';
import { CensusFollowupEntity } from './entities/census-followup.entity';
import { CensusService } from './census.service';
import { CensusController } from './census.controller';

/** ✅ Recensement des clients et vendeurs existants (relance des anciens clients) */
@Module({
    imports: [TypeOrmModule.forFeature([CensusRecordEntity, CensusFollowupEntity])],
    controllers: [CensusController],
    providers: [CensusService, I18nService],
    exports: [CensusService],
})
export class CensusModule { }
