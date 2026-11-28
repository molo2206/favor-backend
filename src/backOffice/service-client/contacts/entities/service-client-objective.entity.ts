import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ObjectivePeriodicity } from '../enums/objective-periodicity.enum';

/**
 * Objectif de contact que le SERVICE CLIENT se fixe.
 * Il définit les CRITÈRES (mêmes filtres que by-destination) + une PÉRIODICITÉ + une cible.
 * La liste des clients à contacter en découle dynamiquement, et le suivi « contacté »
 * est réinitialisé à chaque période.
 */
@Entity('service_client_objectives')
@Index('idx_sco_active', ['isActive'])
export class ServiceClientObjective {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  /**
   * Critères = filtres by-destination (JSON), ex. :
   * { "type": "SHIPMENT", "city": "Cotonou", "country": "Benin", "shippingCompanyId": "...", "onlySellers": false }
   */
  @Column({ type: 'json', nullable: true })
  filters?: Record<string, any> | null;

  @Column({ type: 'enum', enum: ObjectivePeriodicity, default: ObjectivePeriodicity.WEEKLY })
  periodicity: ObjectivePeriodicity;

  /** Cible : nombre de clients à contacter par période (0 = pas de cible chiffrée) */
  @Column({ type: 'int', default: 0 })
  targetCount: number;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  isActive: boolean;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
