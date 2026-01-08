// src/shipments/entities/shipment.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  OneToOne,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TypeTransport } from './type-transport.entity';
import { PackageDetails } from './package-details.entity';
import { ShipmentTracking } from './shipment_tracking.entity';
import { ShipmentStatus } from '../enum/shipment.dto';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('shipments')
export class Shipment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index('IDX_trackingNumber') // Nom explicite pour l'index
  trackingNumber: string;

  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  userId: string;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ default: false })
  pickupEnabled: boolean;

  @Column({ default: false })
  shippingEnabled: boolean;

  @Column({ default: false })
  deliveryEnabled: boolean;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    default: ShipmentStatus.PENDING,
  })
  status: ShipmentStatus;

  @Column({ nullable: true })
  pickupFrom: string;

  @Column({ nullable: true })
  pickupTo: string;

  @Column({ nullable: true })
  pickupContactName: string;

  @Column({ nullable: true })
  pickupContactPhone: string;

  @Column({ nullable: true })
  shippingFrom: string;

  @Column({ nullable: true })
  shippingTo: string;

  @Column({ nullable: true })
  deliveryFrom: string;

  @Column({ nullable: true })
  deliveryTo: string;

  @Column({ nullable: true })
  deliveryContactName: string;

  @Column({ nullable: true })
  deliveryContactPhone: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  // CORRECTION : Utilisez 'varchar' au lieu de 'uuid' pour correspondre à votre SQL
  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
    name: 'pickupTransportTypeId', // Nom explicite
  })
  pickupTransportTypeId: string;

  @ManyToOne(() => TypeTransport, { nullable: true })
  @JoinColumn({ name: 'pickupTransportTypeId' })
  pickupTransportType: TypeTransport;

  // CORRECTION : Utilisez 'varchar' au lieu de 'uuid'
  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
    name: 'shippingTransportTypeId', // Nom explicite
  })
  shippingTransportTypeId: string;

  @ManyToOne(() => TypeTransport, { nullable: true })
  @JoinColumn({ name: 'shippingTransportTypeId' })
  shippingTransportType: TypeTransport;

  // CORRECTION : Utilisez 'varchar' au lieu de 'uuid'
  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
    name: 'deliveryTransportTypeId', // Nom explicite
  })
  deliveryTransportTypeId: string;

  @ManyToOne(() => TypeTransport, { nullable: true })
  @JoinColumn({ name: 'deliveryTransportTypeId' })
  deliveryTransportType: TypeTransport;

  // CORRECTION : Pour la relation OneToOne avec PackageDetails
  // Option 1: Si PackageDetails a shipmentId (recommandé)
  // (Dans ce cas, vous n'avez pas besoin de packageId ici)

  // Option 2: Si vous voulez packageId dans Shipment
  @OneToOne(() => PackageDetails, {
    cascade: true,
    nullable: true,
  })
  @JoinColumn() // Laissez TypeORM gérer la colonne (créera packageId automatiquement)
  package: PackageDetails;

  @OneToMany(() => ShipmentTracking, (tracking) => tracking.shipment, {
    cascade: true, // Ajoutez cascade si vous voulez la suppression en cascade
  })
  trackings: ShipmentTracking[];

  @Column({ type: 'float', nullable: true })
  pickupPrice: number;

  @Column({ type: 'float', nullable: true })
  shippingPrice: number;

  @Column({ type: 'float', nullable: true })
  deliveryPrice: number;

  @Column({ type: 'float', nullable: true })
  totalPrice: number;
}
