// src/sms/entities/sms-recharge.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { Country } from 'src/company/entities/country.entity';

export enum SmsCategory {
  ORDER = 'ORDER',
  SHIPMENT = 'SHIPMENT',
  AUTH = 'AUTH',
  SERVICE_CLIENT = 'SERVICE_CLIENT',
}

export enum SmsRechargeStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  EXHAUSTED = 'EXHAUSTED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

@Entity('sms_recharges')
@Index(['category', 'status'])
@Index('idx_sms_recharges_cat_country_status', ['category', 'countryId', 'status'])
export class SmsRechargeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity | null;

  @Column({ type: 'enum', enum: SmsCategory })
  category: SmsCategory;

  /**
   * ✅ Pays du quota (table `countries`).
   * NULL = quota commun, utilisable pour tous les pays (les recharges existantes).
   */
  @Column({ type: 'varchar', length: 36, nullable: true })
  countryId: string | null;

  @ManyToOne(() => Country, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'countryId' })
  country: Country | null;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'int', default: 0 })
  used: number;

  @Column({ type: 'int', default: 0 })
  remaining: number;

  @Column({
    type: 'enum',
    enum: SmsRechargeStatus,
    default: SmsRechargeStatus.PENDING,
  })
  status: SmsRechargeStatus;

  @Column({ type: 'varchar', nullable: true })
  paymentReference: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}