import {
    Column, CreateDateColumn, Entity, Index, JoinColumn,
    ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { CommissionStatus } from '../../common/enums/commission-status.enum';

@Entity('commissions')
export class CommissionEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => UserEntity, { nullable: false })
    @JoinColumn({ name: 'salesRepId' })
    salesRep: UserEntity;

    @Index('idx_commissions_sales_rep')
    @Column()
    salesRepId: string;

    @Column({ type: 'decimal', precision: 15, scale: 2 })
    saleAmount: number;

    @Column({ type: 'decimal', precision: 5, scale: 2 })
    commissionRate: number;

    @Column({ type: 'decimal', precision: 15, scale: 2 })
    commissionAmount: number;

    @Column({ default: 'USD' })
    currency: string;

    @Column({ type: 'enum', enum: CommissionStatus, default: CommissionStatus.PENDING })
    status: CommissionStatus;

    @Column({ nullable: true })
    sourceId?: string;

    @Column({ nullable: true })
    sourceType?: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}