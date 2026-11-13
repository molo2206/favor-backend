// src/backOffice/commercial/prospects/entities/prospect-history.entity.ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ProspectHistoryAction } from '../../common/enums/prospect-tracking.enum';

/**
 * ✅ Journal des activités sur les prospects : création, modification, assignation, transfert,
 * changement de statut, traitement, conversion, rattachement à un compte, suppression.
 */
@Entity('prospect_history')
@Index('idx_prospect_history_prospect', ['prospectId', 'createdAt'])
@Index('idx_prospect_history_user', ['userId', 'createdAt'])
@Index('idx_prospect_history_action', ['action', 'createdAt'])
export class ProspectHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  prospectId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  prospectName?: string | null;

  @Column({ type: 'varchar', length: 30 })
  action: ProspectHistoryAction;

  /** Agent qui a fait l'action */
  @Column({ type: 'varchar', length: 36, nullable: true })
  userId?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  userName?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  oldStatus?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  newStatus?: string | null;

  /** Champs modifiés : { champ: [avant, après] } */
  @Column({ type: 'json', nullable: true })
  changes?: Record<string, [any, any]> | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
