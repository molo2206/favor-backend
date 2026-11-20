// src/backOffice/commercial/prospects/entities/prospect-assignment.entity.ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ProspectAssignmentType } from '../../common/enums/prospect-tracking.enum';

/**
 * ✅ Historique des assignations / transferts de prospects (une ligne par changement de responsable).
 * Conservé même si le prospect change plusieurs fois de responsable ou est supprimé.
 */
@Entity('prospect_assignments')
@Index('idx_prospect_assign_prospect', ['prospectId', 'createdAt'])
@Index('idx_prospect_assign_by', ['assignedById', 'createdAt'])
@Index('idx_prospect_assign_to', ['toUserId', 'createdAt'])
@Index('idx_prospect_assign_from', ['fromUserId', 'createdAt'])
export class ProspectAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  prospectId: string;

  /** Nom du prospect au moment de l'assignation (si supprimé ensuite) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  prospectName?: string | null;

  @Column({ type: 'varchar', length: 20 })
  type: ProspectAssignmentType;

  /** Ancien responsable */
  @Column({ type: 'varchar', length: 36, nullable: true })
  fromUserId?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  fromUserName?: string | null;

  /** Nouveau responsable */
  @Column({ type: 'varchar', length: 36, nullable: true })
  toUserId?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  toUserName?: string | null;

  /** Agent qui a fait l'assignation */
  @Column({ type: 'varchar', length: 36, nullable: true })
  assignedById?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  assignedByName?: string | null;

  /** Statut du prospect au moment de l'assignation */
  @Column({ type: 'varchar', length: 30, nullable: true })
  statusAtAssignment?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
