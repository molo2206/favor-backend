import {
    Column, CreateDateColumn, Entity, Index, JoinColumn,
    ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { ComplaintLevel } from '../../common/enums/complaint-level.enum';

export enum ComplaintStatus {
    OPEN = 'OPEN',
    IN_PROGRESS = 'IN_PROGRESS',
    RESOLVED = 'RESOLVED',
    CLOSED = 'CLOSED',
}

@Entity('complaints')
export class ComplaintEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index('idx_complaints_number', { unique: true })
    @Column({ unique: true })
    number: string;

    @Column()
    subject: string;

    @Column({ type: 'text' })
    description: string;

    @Column({ type: 'enum', enum: ComplaintLevel, default: ComplaintLevel.NORMAL })
    level: ComplaintLevel;

    @Column({ type: 'enum', enum: ComplaintStatus, default: ComplaintStatus.OPEN })
    status: ComplaintStatus;

    @Column({ type: 'text', nullable: true })
    correctiveAction?: string;

    @Column({ type: 'text', nullable: true })
    clientResponse?: string;

    @ManyToOne(() => UserEntity, { nullable: true })
    @JoinColumn({ name: 'customerId' })
    customer?: UserEntity;

    @Index('idx_complaints_customer')
    @Column({ nullable: true })
    customerId?: string;

    @ManyToOne(() => UserEntity, { nullable: true })
    @JoinColumn({ name: 'agentId' })
    agent?: UserEntity;

    @Index('idx_complaints_agent')
    @Column({ nullable: true })
    agentId?: string;

    @Column({ type: 'json', nullable: true })
    attachments?: any;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}