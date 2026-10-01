import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { OrderEntity } from './order.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { AssignmentStatus } from '../enum/assignment-status.enum';

@Entity('order_delivery_assignments')
@Index('IDX_oda_order_active', ['orderId', 'isActive'])
@Index('IDX_oda_deliver_status', ['deliverId', 'status'])
@Index('IDX_oda_status', ['status'])
export class OrderDeliveryAssignment {
  // ============================================================
  // 🔑 CLÉ PRIMAIRE
  // ============================================================
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ============================================================
  // 🔗 CLÉS ÉTRANGÈRES
  // ============================================================

  /** Commande concernée (contient déjà l'adresse et les coordonnées GPS) */
  @ManyToOne(() => OrderEntity, (order) => order.deliveryAssignments, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'orderId' })
  order: OrderEntity;

  @Column()
  orderId: string;

  /** Livreur affecté (User avec role DELIVERY) */
  @ManyToOne(() => UserEntity, (user) => user.deliveryAssignments, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'deliverId' })
  deliver: UserEntity;

  @Column()
  deliverId: string;

  /** Admin qui a affecté le livreur */
  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'assignedById' })
  assignedBy?: UserEntity;

  @Column({ nullable: true })
  assignedById?: string;

  // ============================================================
  // 📊 STATUT DE L'AFFECTATION
  // ============================================================
  @Column({
    type: 'enum',
    enum: AssignmentStatus,
    default: AssignmentStatus.ASSIGNED,
  })
  status: AssignmentStatus;

  // ============================================================
  // 📍 POSITION ACTUELLE DU LIVREUR (temps réel)
  // ============================================================
  @Column({ type: 'double precision', nullable: true })
  currentLatitude?: number;

  @Column({ type: 'double precision', nullable: true })
  currentLongitude?: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value?: number) => value,
      from: (value?: string) =>
        value === null || value === undefined ? null : parseFloat(value),
    },
  })
  currentSpeed?: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value?: number) => value,
      from: (value?: string) =>
        value === null || value === undefined ? null : parseFloat(value),
    },
  })
  currentHeading?: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value?: number) => value,
      from: (value?: string) =>
        value === null || value === undefined ? null : parseFloat(value),
    },
  })
  distanceRemainingKm?: number;

  @Column({ type: 'int', nullable: true })
  estimatedArrivalMinutes?: number;

  @Column({ type: 'timestamp', nullable: true })
  lastLocationUpdate?: Date;

  // ============================================================
  // 📅 CYCLE DE VIE DE L'AFFECTATION
  // ============================================================
  @Column({ type: 'timestamp', nullable: true })
  assignedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  pickedUpAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  // ============================================================
  // 🔘 FLAGS
  // ============================================================
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // ============================================================
  // ⏱️ MÉTADONNÉES
  // ============================================================
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}