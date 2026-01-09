// src/shipments/entities/package-details.entity.ts - VERSION SIMPLIFIÉE
import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { Shipment } from './shipment.entity';

@Entity('package_details')
export class PackageDetails {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  description: string;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  weight?: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  length?: number;

  @Column({ nullable: true })
  dimensions?: string;

  @Column('int', { nullable: true })
  internal_quantity?: number;

  @Column('int')
  external_quantity: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  value?: number;

  @Column({ type: 'boolean', default: false })
  fragile: boolean;

  @OneToOne(() => Shipment, (shipment) => shipment.package)
  shipment: Shipment;
}
