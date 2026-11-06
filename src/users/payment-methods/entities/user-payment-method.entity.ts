import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';

/** ✅ Modes de paiement qu'un utilisateur peut enregistrer */
export enum UserPaymentMethodType {
  MOBILE_MONEY = 'MOBILE_MONEY',
  FPAY = 'FPAY',
  CASH = 'CASH',
}

/**
 * ✅ Moyens de paiement enregistrés par chaque utilisateur (comme « Moyens de paiement » de Bolt) :
 *  - MOBILE_MONEY : opérateur Pawapay (VODACOM_MPESA_COD, AIRTEL_COD, ORANGE_COD…) + numéro ;
 *  - FPAY         : compte Favor Pay (numéro / e-mail affiché) — le jeton FPay reste envoyé par l'app au paiement ;
 *  - CASH         : espèces (aucun détail).
 * Un seul moyen par défaut par utilisateur.
 */
@Entity('user_payment_methods')
@Index('idx_upm_user', ['userId', 'isActive'])
export class UserPaymentMethodEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'enum', enum: UserPaymentMethodType })
  type: UserPaymentMethodType;

  /** Nom donné par l'utilisateur (ex. « M-Pesa perso ») */
  @Column({ type: 'varchar', length: 80, nullable: true })
  label?: string | null;

  /** Mobile Money : opérateur Pawapay */
  @Column({ type: 'varchar', length: 60, nullable: true })
  provider?: string | null;

  /** Mobile Money : numéro (ex. 243970000000) */
  @Column({ type: 'varchar', length: 30, nullable: true })
  phone?: string | null;

  /** FPay : compte affiché (numéro ou e-mail) */
  @Column({ type: 'varchar', length: 120, nullable: true })
  fpayAccount?: string | null;

  /** Devise préférée pour ce moyen (USD, CDF…) */
  @Column({ type: 'varchar', length: 10, nullable: true })
  currency?: string | null;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastUsedAt?: Date | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
