import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { decimalNumber } from '../../common/decimal.transformer';
import { FleetFuelType, FleetVehicleStatus, FleetVehicleType } from '../../common/logistics.enums';

/** Engin du charroi (tout le matériel roulant : voiture, camion, moto, vélo, tricycle…) */
@Entity('bo_fleet_vehicles')
@Unique('uq_fleet_vehicle_plate', ['companyId', 'plateNumber'])
@Unique('uq_fleet_vehicle_internal', ['companyId', 'internalNumber'])
@Index('idx_fleet_vehicle_status', ['companyId', 'status'])
export class FleetVehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity;

  /** Branche de rattachement */
  @Column({ type: 'varchar', length: 36, nullable: true })
  branchId?: string | null;

  @ManyToOne(() => BranchEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branchId' })
  branch?: BranchEntity | null;

  /** ✅ Immatriculation — facultative pour les engins qui n'en ont pas (vélo, tricycle non immatriculé…) */
  @Column({ type: 'varchar', length: 30, nullable: true })
  plateNumber?: string | null;

  /** ✅ AJOUT : n° interne (généré : ENG-0001) — sert d'identifiant quand il n'y a pas de plaque */
  @Column({ type: 'varchar', length: 30, nullable: true })
  internalNumber?: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  brand?: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  model?: string | null;

  @Column({ type: 'int', nullable: true })
  year?: number | null;

  @Column({ type: 'enum', enum: FleetVehicleType, default: FleetVehicleType.CAR })
  type: FleetVehicleType;

  @Column({ type: 'enum', enum: FleetFuelType, default: FleetFuelType.DIESEL })
  fuelType: FleetFuelType;

  @Column({ type: 'varchar', length: 40, nullable: true })
  color?: string | null;

  /** Numéro de châssis */
  @Column({ type: 'varchar', length: 50, nullable: true })
  vin?: string | null;

  @Column({ type: 'int', nullable: true })
  seats?: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: decimalNumber })
  capacityKg?: number | null;

  /** Kilométrage actuel */
  @Column({ type: 'int', default: 0 })
  mileage: number;

  @Column({ type: 'enum', enum: FleetVehicleStatus, default: FleetVehicleStatus.AVAILABLE })
  status: FleetVehicleStatus;

  /** Chauffeur habituel */
  @Column({ type: 'varchar', length: 36, nullable: true })
  assignedDriverId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedDriverId' })
  assignedDriver?: UserEntity | null;

  @Column({ type: 'date', nullable: true })
  acquisitionDate?: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  acquisitionCost?: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  photoUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
