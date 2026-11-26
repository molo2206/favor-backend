import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Surcharge en base des capacités par type d'entreprise.
 * Une ligne par type (clé = companyType). Les colonnes NULL = on garde le défaut du code.
 * Permet d'ajuster le comportement d'un type sans redéployer (dynamisation).
 */
@Entity('type_company_config')
export class TypeCompanyConfig {
  /** Valeur de CompanyType (RESTAURANT, SHOP, PHARMACIE…) */
  @PrimaryColumn({ type: 'varchar', length: 40 })
  companyType: string;

  @Column({ type: 'tinyint', width: 1, nullable: true })
  hasInventory?: boolean | null;

  @Column({ type: 'tinyint', width: 1, nullable: true })
  hasPOS?: boolean | null;

  @Column({ type: 'tinyint', width: 1, nullable: true })
  offlineEnabled?: boolean | null;

  @Column({ type: 'tinyint', width: 1, nullable: true })
  tracksLots?: boolean | null;

  @Column({ type: 'tinyint', width: 1, nullable: true })
  tracksExpiry?: boolean | null;

  @Column({ type: 'tinyint', width: 1, nullable: true })
  requiresPrescription?: boolean | null;

  @Column({ type: 'tinyint', width: 1, nullable: true })
  controlledRegister?: boolean | null;

  @Column({ type: 'tinyint', width: 1, nullable: true })
  sellByFraction?: boolean | null;

  @Column({ type: 'tinyint', width: 1, nullable: true })
  allowNegativeStock?: boolean | null;

  /** Opérations offline autorisées (JSON ex. ["SALE","STOCK_OUT"]) ; NULL = défaut du code */
  @Column({ type: 'json', nullable: true })
  offlineAllowedOps?: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
