// src/sms/entities/sms-log.entity.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
} from 'typeorm';
import { SmsCategory } from './sms-recharge.entity';

export enum SmsLogStatus {
    SENT = 'SENT',
    FAILED = 'FAILED',
    SKIPPED_NO_QUOTA = 'SKIPPED_NO_QUOTA',
    SKIPPED_NO_PHONE = 'SKIPPED_NO_PHONE',
}

@Entity('sms_logs')
@Index(['category', 'createdAt'])
export class SmsLogEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'enum', enum: SmsCategory })
    category: SmsCategory;

    @Column({ type: 'varchar', length: 30 })
    recipient: string;

    @Column({ type: 'text' })
    message: string;

    @Column({ type: 'enum', enum: SmsLogStatus })
    status: SmsLogStatus;

    @Column({ type: 'int', default: 0 })
    quotaBefore: number;

    @Column({ type: 'int', default: 0 })
    quotaAfter: number;

    @Column({ type: 'text', nullable: true })
    errorMessage: string | null;

    @Column({ type: 'uuid', nullable: true })
    referenceId: string | null;

    @Column({ type: 'varchar', nullable: true })
    referenceType: string | null;

    @CreateDateColumn()
    createdAt: Date;
}