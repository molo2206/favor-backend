import { CategoryEntity } from 'src/category/entities/category.entity';
import { City } from 'src/company/entities/city.entity';
import { RideStatus } from 'src/Course et Taxi/Ride/enum/RideStatus.enum';
import { UserEntity } from 'src/users/entities/user.entity';
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

@Entity('rides')
@Index(['status'])
@Index(['driverId'])
@Index(['riderId'])
@Index(['cityId'])
export class Ride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Rider (obligatoire)
  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'riderId' })
  rider: UserEntity;

  @Column({ type: 'varchar', length: 36 })
  riderId: string;

  // Driver (optionnel)
  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'driverId' })
  driver: UserEntity;

  @Column({ type: 'varchar', length: 36, nullable: true })
  driverId?: string;

  // Ville
  @ManyToOne(() => City)
  @JoinColumn({ name: 'cityId' })
  city: City;

  @Column({ type: 'varchar', length: 36 })
  cityId: string;

  // Catégorie
  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'categoryId' })
  category: CategoryEntity;

  @Column({ type: 'varchar', length: 36 })
  categoryId: string;

  // Locations
  @Column('json')
  pickupLocation: {
    lat: number;
    lng: number;
    address?: string;
    placeId?: string;
  };

  @Column('json')
  dropoffLocation: {
    lat: number;
    lng: number;
    address?: string;
    placeId?: string;
  };

  // Google
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  distance: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  duration: number;

  @Column({ nullable: true })
  directionsPolyline: string;

  // Prix
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  price: number;

  @Column('decimal', { precision: 5, scale: 2, default: 1 })
  surgeMultiplier: number;

  // Statut
  @Column({
    type: 'enum',
    enum: RideStatus,
    default: RideStatus.PENDING,
  })
  status: RideStatus;

  @Column({ type: 'enum', enum: ['RIDER', 'DRIVER', 'SYSTEM'], nullable: true })
  cancelledBy?: 'RIDER' | 'DRIVER' | 'SYSTEM';

  @Column({ nullable: true, type: 'text' })
  cancellationReason?: string;

  // ============================================================
  // ✅ AJOUT : cycle de course type Bolt (colonnes nullables)
  // ============================================================

  /** Véhicule du chauffeur utilisé pour la course */
  @Column({ type: 'varchar', length: 36, nullable: true })
  vehicleId?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, default: 'CASH' })
  paymentMethod?: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currency?: string | null;

  /** Prix final (calculé à la fin de la course) */
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  finalPrice?: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  commissionAmount?: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  driverEarning?: number | null;

  // ============================================================
  // ✅ AJOUT : commission du véhicule + paiement de la course
  // ============================================================

  /** Commission (%) du véhicule au moment de l'acceptation (driver_vehicles.commissionRate) */
  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  commissionRate?: number | null;

  /** ✅ Association du chauffeur au moment de l'acceptation (NULL = chauffeur privé) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  associationId?: string | null;

  /** ✅ Part de l'association (% du prix), figée à l'acceptation */
  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  associationCommissionRate?: number | null;

  /** ✅ Montant dû à l'association (indicatif, calculé à la fin de la course) — réglé manuellement, non déduit du chauffeur */
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  associationCommissionAmount?: number | null;

  /** Frais de transaction (Mobile Money) ajoutés au prix de la course */
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  transactionFee?: number | null;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  transactionFeeRate?: number | null;

  /** Montant payé par le passager = prix final + frais de transaction */
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  totalToPay?: number | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  paymentStatus: string;

  /** Opérateur Mobile Money (VODACOM_MPESA_COD, ORANGE_COD…) */
  @Column({ type: 'varchar', length: 60, nullable: true })
  paymentProvider?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  paymentPhone?: string | null;

  /** depositId Pawapay */
  @Column({ type: 'varchar', length: 100, nullable: true })
  paymentExternalId?: string | null;

  /** Transaction FPay */
  @Column({ type: 'varchar', length: 100, nullable: true })
  paymentTransactionId?: string | null;

  /** Référence (FPay, virement, reçu…) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  paymentReference?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  paymentFailureReason?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  paymentStartedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  paidAt?: Date | null;

  /** Qui a confirmé un paiement hors application (chauffeur ou admin) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  paymentConfirmedById?: string | null;

  /** Recherche de chauffeur */
  @Column({ type: 'int', default: 0 })
  dispatchRound: number;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  lastDispatchAt?: Date | null;

  @Column({ type: 'json', nullable: true })
  notifiedDriverIds?: string[] | null;

  @Column({ type: 'json', nullable: true })
  rejectedDriverIds?: string[] | null;

  /** Horodatage des étapes */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  acceptedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  arrivedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  cancelledAt?: Date | null;

  /** Notes après la course (1 à 5) */
  @Column({ type: 'tinyint', nullable: true })
  driverRating?: number | null; // note donnée AU chauffeur par le passager

  @Column({ type: 'varchar', length: 500, nullable: true })
  driverRatingComment?: string | null;

  @Column({ type: 'tinyint', nullable: true })
  riderRating?: number | null; // note donnée AU passager par le chauffeur

  @Column({ type: 'varchar', length: 500, nullable: true })
  riderRatingComment?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
