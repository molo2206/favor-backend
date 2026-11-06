// src/backOffice/needs/entities/need-signature.entity.ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Qui signe un état de besoin */
export enum NeedSignatureRole {
  REQUESTER = 'REQUESTER', // demandeur (soumission)
  VALIDATOR = 'VALIDATOR', // validateur d'un niveau du circuit
  FINANCE = 'FINANCE', // autorisation financière
  CASHIER = 'CASHIER', // décaissement / paiement
}

/**
 * ✅ Signature apposée sur un état de besoin.
 *    L'URL de l'image est copiée au moment de la signature : si l'utilisateur change de signature plus tard,
 *    le document garde celle du jour où il a signé.
 */
@Entity('bo_need_signatures')
@Index('idx_bo_need_sig_need', ['needId', 'signedAt'])
@Index('idx_bo_need_sig_ref', ['refId'])
export class NeedSignature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  needId: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  signerName?: string | null;

  @Column({ type: 'varchar', length: 20 })
  role: NeedSignatureRole;

  /** SUBMITTED, RESUBMITTED, APPROVED, OVERRIDE, AUTHORIZED, DISBURSED */
  @Column({ type: 'varchar', length: 30 })
  action: string;

  @Column({ type: 'int', nullable: true })
  level?: number | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  levelName?: string | null;

  /** Élément lié (ex. id du décaissement) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  refId?: string | null;

  /** Image de la signature au moment de la signature (null si l'utilisateur n'en avait pas) */
  @Column({ type: 'varchar', length: 500, nullable: true })
  signatureUrl?: string | null;

  @Column({ type: 'datetime', precision: 6 })
  signedAt: Date;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
