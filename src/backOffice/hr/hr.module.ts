import { Module } from '@nestjs/common';
import { EmployeesModule } from './employees/employees.module';
import { DepartmentsModule } from './departments/departments.module';
import { LeavesModule } from './leaves/leaves.module';
import { AttendanceModule } from './attendance/attendance.module';
import { PositionModule } from './positions/position.module';

@Module({
    imports: [
        EmployeesModule,
        DepartmentsModule,
        LeavesModule,
        AttendanceModule,
        PositionModule,
    ],
    exports: [
        EmployeesModule,
        DepartmentsModule,
        LeavesModule,
        AttendanceModule,
        PositionModule
    ],
})
export class HrModule { }