import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { CompanyType } from 'src/company/enum/type.company.enum';

/**
 * 💰 Taux de commission de la plateforme sur la CONFECTION (hors livraison).
 *
 * Résolution (du plus précis au plus général) :
 *   1) ligne active avec `companyId` = l'entreprise      → taux propre à cet atelier
 *   2) sinon ligne active avec `companyType` = son type   → taux par défaut du type (ex. ATELIER_COUTURE)
 *   3) sinon → 0 (pas de commission)
 *
 * `ratePercent` : pourcentage (ex. 10 = 10 %). `minFee` : commission minimale facultative.
 */
@Entity('atelier_commissions')
@Index('idx_acom_company', ['companyId'])
@Index('idx_acom_type', ['companyType'])
export class AtelierCommissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Entreprise ciblée ; NULL = règle par TYPE (voir companyType) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  companyId: string | null;

  /** Type d'entreprise ciblé (défaut du type) ; NULL = règle propre à une entreprise */
  @Column({ type: 'enum', enum: CompanyType, nullable: true })
  companyType: CompanyType | null;

  /** Taux en pourcentage (10 = 10 %) */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  ratePercent: number;

  /** Commission minimale (facultative) */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  minFee: number | null;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  isActive: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
