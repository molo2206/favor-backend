import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { ContactRefType } from '../enums/contact-ref-type.enum';

/**
 * Suivi des contacts du SERVICE CLIENT avec les clients (propriétaires de colis/commandes/courses…).
 * Un enregistrement par (client, type de contexte, référence). refId = '' pour un contact général.
 */
@Entity('service_client_contacts')
@Unique('uq_scc_client_ref', ['clientUserId', 'refType', 'refId', 'objectiveId', 'periodKey'])
@Index('idx_scc_client', ['clientUserId'])
@Index('idx_scc_ref', ['refType', 'refId'])
@Index('idx_scc_objective_period', ['objectiveId', 'periodKey'])
export class ServiceClientContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Le client contacté (propriétaire de l'objet) */
  @Column({ type: 'varchar', length: 36 })
  clientUserId: string;

  @Column({ type: 'enum', enum: ContactRefType, default: ContactRefType.GENERAL })
  refType: ContactRefType;

  /** Id de l'objet concerné (LTA, commande…) ; '' pour un contact général */
  @Column({ type: 'varchar', length: 36, default: '' })
  refId: string;

  /** Objectif rattaché (si le contact se fait dans le cadre d'un objectif) ; '' sinon */
  @Column({ type: 'varchar', length: 36, default: '' })
  objectiveId: string;

  /** Clé de période (ex. 2026-W48, 2026-11, 2026-11-28, ALL) ; '' pour un contact hors objectif */
  @Column({ type: 'varchar', length: 20, default: '' })
  periodKey: string;

  /** Coché « contacté » */
  @Column({ type: 'tinyint', width: 1, default: 1 })
  contacted: boolean;

  /** Note facultative de l'agent */
  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** Agent (service client) qui a enregistré le contact */
  @Column({ type: 'varchar', length: 36 })
  contactedById: string;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  contactedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
