import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
  JoinColumn,
} from 'typeorm';
import { LtaEntity } from './lta.entity';
import { Shipment } from 'src/shipment/entity/shipment.entity';

@Entity('lta_shipments')
@Unique('UQ_lta_shipment', ['ltaId', 'shipmentId'])
export class LtaShipmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_lta_shipment_lta')
  ltaId: string;

  @ManyToOne(() => LtaEntity, (lta) => lta.ltaShipments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ltaId' })
  lta: LtaEntity;

  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_lta_shipment_shipment')
  shipmentId: string;

  @ManyToOne(() => Shipment, (shipment) => shipment.ltaShipments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'shipmentId' })
  shipment: Shipment;

  @Column({ type: 'int', default: 0 }) // Changé de 1 à 0 pour correspondre à MySQL
  position: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'boolean', default: false })
  isMaster: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}