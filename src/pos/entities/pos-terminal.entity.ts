import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * Terminal / caisse d'une entreprise. Config POS « dynamique » dans `config` (JSON).
 * `lastSyncSeq` = dernier numéro de séquence appliqué pour la synchro offline.
 */
@Entity('pos_terminals')
@Unique('uq_pos_terminal_code', ['companyId', 'code'])
@Index('idx_pos_terminal_company', ['companyId', 'isActive'])
export class PosTerminal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  branchId?: string | null;

  /** Emplacement de stock d'où sortent les ventes de cette caisse */
  @Column({ type: 'varchar', length: 36, nullable: true })
  locationId?: string | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** Code court unique dans l'entreprise (ex. « CAISSE-01 ») */
  @Column({ type: 'varchar', length: 40 })
  code: string;

  /**
   * Configuration dynamique de la caisse (JSON), ex. :
   * { allowDiscount, requireCustomer, allowNegativeStock, printer, receiptFooter,
   *   taxRate, offline: { enabled, maxQueuedOps } }
   */
  @Column({ type: 'json', nullable: true })
  config?: Record<string, any> | null;

  /** Fonctionnement hors-ligne autorisé sur CE terminal (en plus de la capacité du type) */
  @Column({ type: 'tinyint', width: 1, default: 1 })
  offlineEnabled: boolean;

  /** Dernière séquence de synchro appliquée (ordre garanti par terminal) */
  @Column({ type: 'bigint', default: 0 })
  lastSyncSeq: number;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
