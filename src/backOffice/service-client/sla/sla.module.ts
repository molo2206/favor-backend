import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlaEntity } from './entities/sla.entity';
import { SlaService } from './sla.service';
import { SlaController } from './sla.controller';
import { I18nService } from 'src/libs/common/src';

@Module({
    imports: [TypeOrmModule.forFeature([SlaEntity])],
    controllers: [SlaController],
    providers: [SlaService, I18nService],
    exports: [SlaService],
})
export class SlaModule { }