import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveEntity } from './entities/leave.entity';
import { LeavesService } from './leaves.service';
import { LeavesController } from './leaves.controller';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { UserEntity } from 'src/users/entities/user.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            LeaveEntity,
            EmployeeEntity,   // ⬅️ ajouté
            UserEntity,       // ⬅️ ajouté
        ]),
    ],
    controllers: [LeavesController],
    providers: [LeavesService],
    exports: [LeavesService],
})
export class LeavesModule { }