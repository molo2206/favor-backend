import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 🧵 Palier de taille d'un atelier de couture.
 *
 * Permet d'ajuster le prix selon la taille : une grande taille = plus de tissu/travail.
 * Deux usages possibles pour un même palier :
 *   - AUTOMATIQUE : on renseigne `measureKey` + [`minValue`, `maxValue`]. Si la mesure du
 *     client tombe dans l'intervalle, le `surcharge` est appliqué automatiquement.
 *   - MANUEL : `measureKey` vide → le palier est choisi par son `label` (ex. « XL »).
 *
 * Portée : propre à une entreprise (`companyId`). `productId` NULL = s'applique à TOUS
 * les modèles de l'entreprise ; sinon seulement au modèle indiqué.
 */
@Entity('atelier_size_tiers')
@Index('idx_ast_company', ['companyId'])
@Index('idx_ast_company_product', ['companyId', 'productId'])
export class AtelierSizeTierEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Entreprise (atelier) propriétaire du palier */
  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  /** Modèle concerné ; NULL = tous les modèles de l'entreprise */
  @Column({ type: 'varchar', length: 36, nullable: true })
  productId: string | null;

  /** Clé de mesure pour l'application AUTOMATIQUE (ex. « longueur », « tour_taille ») ; NULL = palier manuel */
  @Column({ type: 'varchar', length: 80, nullable: true })
  measureKey: string | null;

  /** Borne min de la mesure (incluse) pour l'application automatique */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  minValue: number | null;

  /** Borne max de la mesure (incluse) pour l'application automatique */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxValue: number | null;

  /** Libellé affiché (ex. « Standard », « XL », « XXL ») */
  @Column({ type: 'varchar', length: 80 })
  label: string;

  /** Supplément ajouté au prix de base quand ce palier s'applique */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  surcharge: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  isActive: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
