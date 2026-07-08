// src/shipments/entities/shipment.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TypeTransport } from './type-transport.entity';
import { PackageDetails } from './package-details.entity';
import { ShipmentTracking } from './shipment_tracking.entity';
import { ShipmentStatus } from '../enum/shipment.dto';
import { UserEntity } from '../../users/entities/user.entity';
import { LtaShipmentEntity } from '../Lta/entity/lta-shipment.entity';
import { AddressUser } from 'src/address-user/entities/address-user.entity';
import { OperationEntity } from 'src/operation/entity/operation.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';

@Entity('shipments')
export class Shipment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  trackingNumber: string;

  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  userId?: string;

  @Column({ nullable: true })
  image?: string;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;

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

  @Column({ type: 'timestamp', nullable: true })
  collectedAt?: Date;

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

  @OneToOne(() => PackageDetails, {
    cascade: true,
    nullable: true,
  })
  @JoinColumn()
  package: PackageDetails;

  @OneToMany(() => ShipmentTracking, (tracking) => tracking.shipment, {
    cascade: true,
  })
  trackings: ShipmentTracking[];

  @Column({ type: 'float', nullable: true })
  pickupPrice: number;

  @Column({ nullable: true })
  whatsapp_number?: string;

  @Column({ nullable: true })
  paymentMethod?: string;

  @Column({ type: 'float', nullable: true })
  shippingPrice: number;

  @Column({ type: 'float', nullable: true })
  deliveryPrice: number;

  @Column({ type: 'float', nullable: true })
  totalPrice: number;

  @Column({ nullable: true })
  clientName?: string;

  @Column({ nullable: true })
  clientPhone?: string;

  @OneToMany(() => LtaShipmentEntity, (ltaShipment) => ltaShipment.shipment)
  ltaShipments: LtaShipmentEntity[];

  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  deliveryAddressId?: string;

  @ManyToOne(() => AddressUser, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'deliveryAddressId' })
  deliveryAddress?: AddressUser;

  @Column({ nullable: true, length: 6 })
  pin: string;

  @Column({ default: false })
  paid: boolean;

  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  userAssignId?: string;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'userAssignId' })
  userAssign?: UserEntity;

  @OneToMany(() => OperationEntity, (op) => op.shipment)
  operations!: OperationEntity[];

  // 🔹 PICKUP
  @Column({ type: 'varchar', length: 36, nullable: true })
  pickupCompanyId?: string;

  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'pickupCompanyId' })
  pickupCompany?: CompanyEntity;

  // 🔹 SHIPPING
  @Column({ type: 'varchar', length: 36, nullable: true })
  shippingCompanyId?: string;

  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shippingCompanyId' })
  shippingCompany?: CompanyEntity;

  // 🔹 DELIVERY
  @Column({ type: 'varchar', length: 36, nullable: true })
  deliveryCompanyId?: string;

  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deliveryCompanyId' })
  deliveryCompany?: CompanyEntity;
}
