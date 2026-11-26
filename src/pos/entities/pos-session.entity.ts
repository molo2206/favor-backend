import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { decimalNumber } from 'src/classifieds/entities/decimal.transformer';
import { PosSessionStatus } from '../enums/pos.enum';

/**
 * Session de caisse : ouverture (fond de caisse) → ventes → clôture (comptage).
 * Une seule session OPEN par terminal à la fois.
 */
@Entity('pos_sessions')
@Index('idx_pos_session_terminal', ['terminalId', 'status'])
export class PosSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  terminalId: string;

  @Column({ type: 'enum', enum: PosSessionStatus, default: PosSessionStatus.OPEN })
  status: PosSessionStatus;

  @Column({ type: 'varchar', length: 36 })
  openedById: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  openingCash: number;

  @CreateDateColumn()
  openedAt: Date;

  @Column({ type: 'varchar', length: 36, nullable: true })
  closedById?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  closedAt?: Date | null;

  /** Montant théorique en caisse à la clôture (fond + ventes espèces) */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  expectedCash?: number | null;

  /** Montant réellement compté */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  countedCash?: number | null;

  /** Écart (compté - théorique) */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, transformer: decimalNumber })
  cashDifference?: number | null;

  /** Total des ventes de la session (toutes méthodes) */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  totalSales: number;

  @Column({ type: 'int', default: 0 })
  salesCount: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
