import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplaintEntity } from './entities/complaint.entity';
import { UserEntity } from 'src/users/entities/user.entity';       // ✅ AJOUTER
import { ComplaintsService } from './complaints.service';
import { ComplaintsController } from './complaints.controller';
import { I18nService } from 'src/libs/common/src';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ComplaintEntity,
            UserEntity,   // ✅ AJOUTER
        ]),
    ],
    controllers: [ComplaintsController],
    providers: [ComplaintsService, I18nService],
    exports: [ComplaintsService],
})
export class ComplaintsModule { }