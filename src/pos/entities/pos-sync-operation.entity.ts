import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** Résultat d'application d'une opération de synchro (idempotence par terminal + clientOpId) */
export enum SyncOpStatus {
  APPLIED = 'APPLIED', // appliquée avec succès
  DUPLICATE = 'DUPLICATE', // déjà appliquée précédemment
  REJECTED = 'REJECTED', // interdite hors-ligne (ex. vente sur ordonnance)
  CONFLICT = 'CONFLICT', // conflit de stock (stock insuffisant côté serveur)
  FAILED = 'FAILED', // erreur technique
}

/**
 * Journal idempotent des opérations synchronisées depuis une caisse hors-ligne.
 * Une opération (terminalId + clientOpId) n'est appliquée qu'UNE fois ; un renvoi
 * retourne le résultat déjà enregistré.
 */
@Entity('pos_sync_operations')
@Unique('uq_pos_sync_op', ['terminalId', 'clientOpId'])
@Index('idx_pos_sync_terminal_seq', ['terminalId', 'seq'])
export class PosSyncOperation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  terminalId: string;

  /** Identifiant unique généré par la caisse pour cette opération */
  @Column({ type: 'varchar', length: 80 })
  clientOpId: string;

  /** Numéro de séquence croissant par terminal (ordre d'application) */
  @Column({ type: 'bigint', default: 0 })
  seq: number;

  /** Type d'opération : SALE | STOCK_IN | STOCK_OUT */
  @Column({ type: 'varchar', length: 30 })
  type: string;

  @Column({ type: 'varchar', length: 20 })
  status: SyncOpStatus;

  /** Résultat (id de vente, solde, ou message d'erreur) renvoyé à la caisse */
  @Column({ type: 'json', nullable: true })
  result?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
