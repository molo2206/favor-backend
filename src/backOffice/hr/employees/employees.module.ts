import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { EmployeeEntity } from './entities/employee.entity';
import { DepartmentEntity } from '../departments/entities/department.entity';
@Module({
    imports: [
        TypeOrmModule.forFeature([
            EmployeeEntity,
            DepartmentEntity,   // ⬅️ AJOUTER cette ligne
        ]),
    ],
    controllers: [EmployeesController],
    providers: [EmployeesService],
    exports: [EmployeesService],
})
export class EmployeesModule { }