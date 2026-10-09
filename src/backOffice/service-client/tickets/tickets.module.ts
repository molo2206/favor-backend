import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketEntity } from './entities/ticket.entity';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { UserEntity } from 'src/users/entities/user.entity';

@Module({
    imports: [TypeOrmModule.forFeature([TicketEntity, UserEntity])],
    controllers: [TicketsController],
    providers: [TicketsService],
    exports: [TicketsService],
})
export class TicketsModule { }