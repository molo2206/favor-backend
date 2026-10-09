import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveEntity } from './entities/leave.entity';
import { LeavesService } from './leaves.service';
import { LeavesController } from './leaves.controller';

@Module({
    imports: [TypeOrmModule.forFeature([LeaveEntity])],
    controllers: [LeavesController],
    providers: [LeavesService],
    exports: [LeavesService],
})
export class LeavesModule { }