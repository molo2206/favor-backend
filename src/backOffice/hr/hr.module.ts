import { Module } from '@nestjs/common';
import { EmployeesModule } from './employees/employees.module';
import { DepartmentsModule } from './departments/departments.module';
import { LeavesModule } from './leaves/leaves.module';
import { AttendanceModule } from './attendance/attendance.module';

@Module({
    imports: [
        EmployeesModule,
        DepartmentsModule,
        LeavesModule,
        AttendanceModule,
    ],
    exports: [
        EmployeesModule,
        DepartmentsModule,
        LeavesModule,
        AttendanceModule,
    ],
})
export class HrModule { }