import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ✅ Tarif du contrôle technique, configurable par les super-admins.
 *  - On ne modifie JAMAIS un tarif existant : configurer un nouveau tarif désactive l'ancien
 *    (isActive = false) mais le conserve → les anciens paiements gardent leur montant d'origine.
 *  - Le montant réellement payé est en plus figé dans chaque dossier de contrôle / paiement.
 */
@Entity('technical_control_tariffs')
@Index('idx_tc_tariff_active', ['isActive'])
export class TechnicalControlTariff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'tinyint', default: 1 })
  isActive: boolean;

  /** Super-admin qui a configuré ce tarif */
  @Column({ type: 'varchar', length: 36, nullable: true })
  configuredById?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
