import {
    Column, CreateDateColumn, Entity, Index, JoinColumn,
    ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { CustomerEntity } from '../../customers/entities/customer.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { ContractStatus } from '../../common/enums/contract-status.enum';

@Entity('contracts')
export class ContractEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index('idx_contracts_number', { unique: true })
    @Column({ unique: true })
    number: string;

    @Column()
    type: string;

    @Column({ type: 'enum', enum: ContractStatus, default: ContractStatus.DRAFT })
    status: ContractStatus;

    @Column({ type: 'timestamp' })
    startDate: Date;

    @Column({ type: 'timestamp', nullable: true })
    endDate?: Date;

    @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
    amount: number;

    @Column({ default: 'USD' })
    currency: string;

    @Column({ type: 'text', nullable: true })
    terms?: string;

    @Column({ nullable: true })
    documentUrl?: string;

    @ManyToOne(() => CustomerEntity, { nullable: true })
    @JoinColumn({ name: 'customerId' })
    customer?: CustomerEntity;

    @Index('idx_contracts_customer')
    @Column({ nullable: true })
    customerId?: string;

    @ManyToOne(() => UserEntity, { nullable: true })
    @JoinColumn({ name: 'managerId' })
    manager?: UserEntity;

    @Index('idx_contracts_manager')
    @Column({ nullable: true })
    managerId?: string;

    @Column({ default: false })
    autoRenew: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}