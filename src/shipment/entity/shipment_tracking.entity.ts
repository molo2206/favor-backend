// src/shipments/entities/shipment_tracking.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import { Shipment } from './shipment.entity';
import { ShipmentStatus } from '../enum/shipment.dto';

@Entity('shipment_tracking')
export class ShipmentTracking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 36,
    nullable: false,
  })
  @Index() // Ajoutez un index
  shipmentId: string;

  // MODIFICATION : Relation ManyToOne sans cascade
  @ManyToOne(() => Shipment, (shipment) => shipment.trackings, {
    nullable: false,
  })
  @JoinColumn({ name: 'shipmentId' })
  shipment: Shipment;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    default: ShipmentStatus.PENDING,
  })
  status: ShipmentStatus;

  @Column({
    type: 'text',
    nullable: true,
  })
  location: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  comment: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
