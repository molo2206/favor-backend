import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';

import { EmployeeEntity } from './entities/employee.entity';
import { DepartmentEntity } from '../departments/entities/department.entity';

// ✅ AJOUT : FilesService pour l'upload d'images
import { FilesService } from 'src/files/files.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            EmployeeEntity,
            DepartmentEntity,
        ]),
    ],
    controllers: [EmployeesController],
    providers: [
        EmployeesService,
        FilesService,          // ✅ AJOUT
    ],
    exports: [
        EmployeesService,
    ],
})
export class EmployeesModule { }