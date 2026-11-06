import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionEntity } from './entities/commission.entity';
import { CommissionsService } from './commissions.service';
import { CommissionsController } from './commissions.controller';

@Module({
    imports: [TypeOrmModule.forFeature([CommissionEntity])],
    controllers: [CommissionsController],
    providers: [CommissionsService],
    exports: [CommissionsService],
})
export class CommissionsModule { }