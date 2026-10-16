import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DepartmentEntity } from './entities/department.entity';
import { UserEntity } from 'src/users/entities/user.entity';   // ✅ AJOUT

import { DepartmentsService } from './departments.service';
import { DepartmentsController } from './departments.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            DepartmentEntity,
            UserEntity,           // ✅ AJOUT
        ]),
    ],
    controllers: [DepartmentsController],
    providers: [DepartmentsService],
    exports: [DepartmentsService],
})
export class DepartmentsModule { }