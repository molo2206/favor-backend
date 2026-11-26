import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { Transmission } from 'src/products/enum/transmission.enum';
import {
  VehicleEngineCondition,
  VehicleOriginality,
  VehicleRegistrationStatus,
  VehicleRegistrationType,
} from '../enums/vehicle-registration.enum';

/** DECIMAL MySQL (renvoyé en texte) → nombre ; NULL reste NULL */
const nullableDecimal: ValueTransformer = {
  to: (v?: number | null) => (v === undefined ? undefined : v === null ? null : Number(v)),
  from: (v?: string | null) => (v === null || v === undefined ? null : Number(v)),
};

/**
 * ✅ Enregistrement d'un véhicule (vente ou location) avec, dans la MÊME table :
 *  - les coordonnées de son propriétaire ;
 *  - celles du commissionnaire qui a apporté le propriétaire (facultatif) et le montant qui lui revient ;
 *  - les images du véhicule (liste d'URL, stockage du serveur).
 */
@Entity('vehicle_registrations')
@Index('uq_vr_reference', ['reference'], { unique: true })
@Index('idx_vr_type_status', ['registrationType', 'status'])
export class VehicleRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Référence lisible : VH-AAMMJJ-XXXXX */
  @Column({ type: 'varchar', length: 30 })
  reference: string;

  // ---------- Véhicule ----------

  /** Nom du véhicule (ex : Toyota Land Cruiser Prado) */
  @Column({ type: 'varchar', length: 150 })
  name: string;

  /** Marque */
  @Column({ type: 'varchar', length: 100 })
  brand: string;

  /** Année */
  @Column({ type: 'int', nullable: true })
  year?: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  color?: string | null;

  @Column({ type: 'enum', enum: Transmission, nullable: true })
  transmission?: Transmission | null;

  /** Kilométrage (km) */
  @Column({ type: 'int', nullable: true })
  mileage?: number | null;

  /** Plaque d'immatriculation (en majuscules) */
  @Column({ type: 'varchar', length: 30, nullable: true })
  @Index('idx_vr_plate')
  plateNumber?: string | null;

  /** État du moteur */
  @Column({ type: 'enum', enum: VehicleEngineCondition, nullable: true })
  engineCondition?: VehicleEngineCondition | null;

  /** Originalité : modifié, accidenté ou pas */
  @Column({ type: 'enum', enum: VehicleOriginality, nullable: true })
  originality?: VehicleOriginality | null;

  /** Documents disponibles (ex : ["CARTE_GRISE", "ASSURANCE"]) */
  @Column({ type: 'json', nullable: true })
  availableDocuments?: string[] | null;

  // ---------- Localisation ----------

  @Column({ type: 'varchar', length: 255, nullable: true })
  locationAddress?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true, transformer: nullableDecimal })
  latitude?: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true, transformer: nullableDecimal })
  longitude?: number | null;

  // ---------- Prix (intervalle min – max) ----------

  /** Vente ou location */
  @Column({ type: 'enum', enum: VehicleRegistrationType })
  registrationType: VehicleRegistrationType;

  /** Prix minimum */
  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: nullableDecimal })
  priceMin: number;

  /** Prix maximum (= prix minimum si non précisé) */
  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: nullableDecimal })
  priceMax: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  // ---------- Propriétaire ----------

  @Column({ type: 'varchar', length: 150 })
  ownerName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ownerAddress?: string | null;

  @Column({ type: 'varchar', length: 30 })
  @Index('idx_vr_owner_phone')
  ownerPhone: string;

  // ---------- Commissionnaire (facultatif) ----------

  @Column({ type: 'varchar', length: 150, nullable: true })
  brokerName?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  @Index('idx_vr_broker_phone')
  brokerPhone?: string | null;

  /** Montant lié au commissionnaire (même devise que le prix) */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: nullableDecimal })
  brokerAmount?: number | null;

  // ---------- Images ----------

  /** URL des images (la première sert de photo principale) */
  @Column({ type: 'json', nullable: true })
  images?: string[] | null;

  // ---------- Suivi ----------

  @Column({ type: 'enum', enum: VehicleRegistrationStatus, default: VehicleRegistrationStatus.AVAILABLE })
  status: VehicleRegistrationStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index('idx_vr_created_by')
  createdById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy?: UserEntity | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedById?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /** Suppression douce (l'enregistrement reste en base) */
  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date | null;
}
