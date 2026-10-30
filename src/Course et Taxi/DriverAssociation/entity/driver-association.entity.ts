import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { City } from 'src/company/entities/city.entity';

const decimal = {
  to: (v?: number | null) => v,
  from: (v?: string | null) => (v === null || v === undefined ? null : Number(v)),
};

/**
 * ✅ Association de chauffeurs (taxi, moto-taxi…).
 * Un chauffeur est soit PRIVÉ (indépendant), soit MEMBRE d'une association (driver_profiles).
 * commissionRate : part (%) du prix de chaque course d'un membre due à l'association.
 * ⚠️ Montant indicatif seulement : il n'est ni prélevé sur le paiement ni déduit du gain du chauffeur ;
 *    l'administration règle l'association manuellement (voir les statistiques).
 */
@Entity('driver_associations')
@Index('idx_driver_assoc_city', ['cityId', 'isActive'])
export class DriverAssociation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  name: string;

  /** Sigle / code court (ex. ACT-GOMA) */
  @Column({ type: 'varchar', length: 30, nullable: true, unique: true })
  code?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  cityId?: string | null;

  @ManyToOne(() => City, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cityId' })
  city?: City | null;

  /** Responsable (nom affiché) et contacts */
  @Column({ type: 'varchar', length: 150, nullable: true })
  managerName?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logoUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /** Part de l'association sur chaque course d'un membre (% du prix de la course) */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, transformer: decimal })
  commissionRate: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
