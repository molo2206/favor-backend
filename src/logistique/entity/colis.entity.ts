import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { ColisTrackingEntity } from './colis-tracking.entity';
import { Country } from 'src/company/entities/country.entity';
import { City } from 'src/company/entities/city.entity';
import { ColisPickupPaymentStatus, ColisPickupPaymentTiming } from '../enum/colis-pickup.enum';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';

export enum ColisStatus {
  PENDING = 'PENDING',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

@Entity('colis')
export class ColisEntity {
  // UUID auto-généré
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  trackingNumber: string;

  @Column('text')
  description: string;

  @Column('float')
  weight: number;

  @Column({ type: 'float', nullable: true })
  value?: number;

  @Column({ type: 'enum', enum: ColisStatus })
  status: ColisStatus;

  @Column({ type: 'varchar', length: 255 })
  pickupAddress: string;

  @Column({ type: 'varchar', length: 255 })
  dropAddress: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'senderId' })
  sender?: UserEntity;

  @Column({ type: 'char', length: 36, nullable: true })
  senderId?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'receiverId' })
  receiver?: UserEntity;

  @Column({ type: 'char', length: 36, nullable: true })
  receiverId?: string;

  @Column({ type: 'json', nullable: true })
  photos?: string[];

  @Column({ nullable: true, length: 6 })
  pin: string;

  @Column({ nullable: true })
  whatsapp_number: string;

  @Column({ nullable: true })
  paymentMethod: string;

  // ==========================================================================
  // ✅ RAMASSAGE — zone (pays/ville), prix calculé selon le poids via la table
  //    des tarifs de ramassage, et moment/état du paiement.
  // ==========================================================================
  /** Pays de ramassage (relation) — sert à retrouver le tarif */
  @Column({ type: 'char', length: 36, nullable: true })
  pickupCountryId?: string | null;

  @ManyToOne(() => Country, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'pickupCountryId' })
  pickupCountry?: Country | null;

  /** Ville de ramassage (relation) — NULL = tarif par défaut du pays */
  @Column({ type: 'char', length: 36, nullable: true })
  pickupCityId?: string | null;

  @ManyToOne(() => City, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'pickupCityId' })
  pickupCity?: City | null;

  /** Prix de ramassage (validé contre le tarif selon le poids) */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  pickupPrice?: number | null;

  /** Devise du prix de ramassage */
  @Column({ type: 'varchar', length: 10, nullable: true, default: 'USD' })
  pickupCurrency?: string | null;

  /** Tarif appliqué (audit) */
  @Column({ type: 'char', length: 36, nullable: true })
  pickupTariffId?: string | null;

  /** Déjà payé au fournisseur, ou à payer pendant le ramassage */
  @Column({ type: 'enum', enum: ColisPickupPaymentTiming, nullable: true })
  pickupPaymentTiming?: ColisPickupPaymentTiming | null;

  /** Si PAS encore payé au fournisseur : montant dû au fournisseur (réglé au ramassage) */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  supplierAmountDue?: number | null;

  /** État du paiement du ramassage */
  @Column({ type: 'enum', enum: ColisPickupPaymentStatus, default: ColisPickupPaymentStatus.PENDING })
  pickupPaymentStatus: ColisPickupPaymentStatus;

  /** Horodatage de l'encaissement du ramassage */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  pickupPaidAt?: Date | null;

  /** Mode d'encaissement du ramassage (mêmes modes que les commandes : CASH, MOBILE_MONEY, BANK, MANUAL, FPAY) */
  @Column({ type: 'varchar', length: 30, nullable: true })
  pickupPaymentMethod?: PaymentMethod | string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  pickupPaymentReference?: string | null;

  @OneToMany(() => ColisTrackingEntity, (tracking) => tracking.colis, { cascade: true })
  trackings?: ColisTrackingEntity[];

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
