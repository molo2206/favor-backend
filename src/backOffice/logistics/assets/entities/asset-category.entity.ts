import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Catégorie de biens (informatique, mobilier, électroménager, outillage…) */
@Entity('bo_asset_categories')
@Unique('uq_bo_asset_category_name', ['companyId', 'name'])
@Index('idx_bo_asset_category_company', ['companyId'])
export class AssetCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** Préfixe des codes d'inventaire (ex. INF → INF-000123) */
  @Column({ type: 'varchar', length: 10, nullable: true })
  code?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  /** Durée d'amortissement par défaut (années) */
  @Column({ type: 'int', nullable: true })
  depreciationYears?: number | null;

  /** ✅ AJOUT : image de la catégorie */
  @Column({ type: 'varchar', length: 500, nullable: true })
  photoUrl?: string | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
