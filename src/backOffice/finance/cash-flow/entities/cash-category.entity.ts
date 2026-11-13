import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CashActivity, CashDirection } from '../common/cash-flow.enums';

/**
 * ✅ Rubrique de trésorerie (ex. Ventes, Salaires, Loyer, Carburant…), entrée OU sortie,
 * rangée dans une rubrique du tableau des flux (exploitation / investissement / financement).
 * Sous-rubriques possibles (parentId).
 */
@Entity('bo_cash_categories')
@Index('idx_bo_cash_categories_company', ['companyId', 'direction', 'isActive'])
export class CashCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  parentId?: string | null;

  @ManyToOne(() => CashCategory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parentId' })
  parent?: CashCategory | null;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  /** Code court (facultatif) ; SYS_… pour les rubriques système */
  @Column({ type: 'varchar', length: 40, nullable: true })
  code?: string | null;

  @Column({ type: 'varchar', length: 3 })
  direction: CashDirection;

  @Column({ type: 'varchar', length: 20, default: CashActivity.OPERATING })
  activity: CashActivity;

  @Column({ type: 'varchar', length: 20, nullable: true })
  color?: string | null;

  @Column({ default: true })
  isActive: boolean;

  /** Rubrique système (écart de caisse, frais de transfert) : non modifiable */
  @Column({ default: false })
  isSystem: boolean;

  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
