import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { LtaShipmentEntity } from './lta-shipment.entity';
import { TrackingltaEntity } from './tracking-lta.entity';
import { DecimalTransformer } from 'src/users/utility/common/transformers/decimal.transformer';
import { ShipmentStatus } from 'src/shipment/enum/shipment.dto';

export enum LtaType {
  MASTER = 'MASTER',
  HOUSE = 'HOUSE',
}

export enum PaymentMode {
  PREPAID = 'PREPAID',
  COLLECT = 'COLLECT',
}

export enum TransportMode {
  AIR = 'AIR',
  SEA = 'SEA',
}

@Entity('lta')
export class LtaEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  ltaNumber: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  externalLtaNumber?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  transitAirportOrPort?: string;

  @Column({ type: 'enum', enum: LtaType })
  ltatype: LtaType;

  @Column({ type: 'enum', enum: TransportMode, default: TransportMode.AIR })
  type: TransportMode;

  @Column({ type: 'varchar', length: 100 })
  originAirportOrPort: string;

  @Column({ type: 'varchar', length: 100 })
  destinationAirportOrPort: string;

  @Column({ type: 'varchar', length: 100 })
  origin: string;

  @Column({ type: 'varchar', length: 100 })
  destination: string;

  @Column({ type: 'date' })
  issueDate: Date;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    default: ShipmentStatus.PENDING,
  })
  status: ShipmentStatus;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  weight: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  volume: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  value: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'enum', enum: PaymentMode, default: PaymentMode.PREPAID })
  paymentMode: PaymentMode;

  @ManyToOne(() => CompanyEntity, { nullable: false })
  @JoinColumn({ name: 'shipperId' })
  shipper: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  shipperId: string;

  @ManyToOne(() => CompanyEntity, { nullable: false })
  @JoinColumn({ name: 'consigneeId' })
  consignee: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  consigneeId: string;

  @ManyToOne(() => CompanyEntity, { nullable: false })
  @JoinColumn({ name: 'Issued_byId' })
  Issued_by: CompanyEntity;

  @Column({ type: 'varchar', length: 36 })
  Issued_byId: string;

  @OneToMany(() => LtaShipmentEntity, (ltaShipment) => ltaShipment.lta, {
    cascade: false, // ← Changé de true à false
    onDelete: 'CASCADE', // Gardez ceci si vous voulez supprimer les enfants quand la LTA est supprimée
  })
  ltaShipments: LtaShipmentEntity[];

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @OneToMany(() => TrackingltaEntity, (tracking) => tracking.lta)
  tracking: TrackingltaEntity[];

  @Column({ default: false })
  sub_lta: boolean;
}
