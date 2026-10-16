// src/users/entities/user-loyalty-history.entity.ts

import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { UserLoyaltyEntity, LoyaltyTransactionType, LoyaltySourceType } from './user-loyalty.entity';

@Entity('user_loyalty_history')
export class UserLoyaltyHistoryEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'userId', type: 'uuid' })
    userId: string;

    @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: UserEntity;

    @Column({ name: 'loyaltyId', type: 'uuid' })
    loyaltyId: string;

    @ManyToOne(() => UserLoyaltyEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'loyaltyId' })
    loyalty: UserLoyaltyEntity;

    @Column({ type: 'int' })
    points: number;

    @Column({ type: 'int' })
    pointsBefore: number;

    @Column({ type: 'int' })
    pointsAfter: number;

    @Column({ type: 'enum', enum: LoyaltyTransactionType })
    transactionType: LoyaltyTransactionType;

    @Column({ type: 'enum', enum: LoyaltySourceType })
    sourceType: LoyaltySourceType;

    @Column({ type: 'varchar', length: 100, nullable: true })
    sourceId: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description: string;

    @Column({ type: 'timestamp', nullable: true })
    expiresAt: Date;

    @Column({ type: 'boolean', default: false })
    isExpired: boolean;

    @CreateDateColumn()
    createdAt: Date;
}