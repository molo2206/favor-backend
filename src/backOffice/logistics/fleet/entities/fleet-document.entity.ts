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
import { decimalNumber } from '../../common/decimal.transformer';
import { FleetDocumentType } from '../../common/logistics.enums';
import { FleetVehicle } from './fleet-vehicle.entity';

/** Document du véhicule (assurance, contrôle technique, carte grise…) */
@Entity('bo_fleet_documents')
@Index('idx_fleet_doc_expiry', ['companyId', 'expiryDate'])
export class FleetDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  vehicleId: string;

  @ManyToOne(() => FleetVehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicleId' })
  vehicle: FleetVehicle;

  @Column({ type: 'enum', enum: FleetDocumentType })
  type: FleetDocumentType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  number?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  issuer?: string | null;

  @Column({ type: 'date', nullable: true })
  issueDate?: string | null;

  @Column({ type: 'date', nullable: true })
  expiryDate?: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: decimalNumber })
  cost?: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  fileUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
