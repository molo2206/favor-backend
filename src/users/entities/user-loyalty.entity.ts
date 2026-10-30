// src/users/entities/user-loyalty.entity.ts

import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

export enum LoyaltyTier {
    BRONZE = 'BRONZE',
    SILVER = 'SILVER',
    GOLD = 'GOLD',
    PLATINUM = 'PLATINUM',
}

export enum LoyaltyTransactionType {
    EARN = 'EARN',
    SPEND = 'SPEND',
    EXPIRED = 'EXPIRED',
    BONUS = 'BONUS',
    REFERRAL = 'REFERRAL',
}

export enum LoyaltySourceType {
    ORDER = 'ORDER',
    PAYMENT = 'PAYMENT',
    REFERRAL = 'REFERRAL',
    BIRTHDAY = 'BIRTHDAY',
    PROMOTION = 'PROMOTION',
    SHIPMENT = 'SHIPMENT',
    TRIP = 'TRIP',
    RIDE = 'RIDE',
    MANUAL = 'MANUAL',
}

@Entity('user_loyalty')
export class UserLoyaltyEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'userId', type: 'uuid' })
    userId: string;

    @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: UserEntity;

    @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
    loyaltyCode: string;

    @Column({ type: 'int', default: 0 })
    pointsBalance: number;

    @Column({ type: 'int', default: 0 })
    pointsTotalEarned: number;

    @Column({ type: 'int', default: 0 })
    pointsTotalSpent: number;

    @Column({ type: 'enum', enum: LoyaltyTier, default: LoyaltyTier.BRONZE })
    currentTier: LoyaltyTier;

    @Column({ type: 'timestamp', nullable: true })
    pointsExpiryDate: Date;

    @Column({ type: 'boolean', default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}