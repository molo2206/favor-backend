import {
    Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { TicketPriority } from '../../common/enums/ticket-priority.enum';

@Entity('sla')
export class SlaEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'enum', enum: TicketPriority, unique: true })
    priority: TicketPriority;

    @Column({ type: 'int' })
    firstResponseMinutes: number;

    @Column({ type: 'int' })
    resolutionMinutes: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}