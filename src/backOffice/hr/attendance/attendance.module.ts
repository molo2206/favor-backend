import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceEntity } from './entities/attendance.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { I18nService } from 'src/libs/common/src';

@Module({
    imports: [
        TypeOrmModule.forFeature([AttendanceEntity, EmployeeEntity]),
    ],
    controllers: [AttendanceController],
    providers: [AttendanceService, I18nService],
    exports: [AttendanceService],
})
export class AttendanceModule { }