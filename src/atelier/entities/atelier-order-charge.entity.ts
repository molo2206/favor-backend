import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 🧾 Trace de la répartition financière d'une commande d'atelier (pour la comptabilité).
 *
 *   confectionAmount = baseAmount + sizeSurcharge
 *   commissionAmount = part de la PLATEFORME (selon le taux résolu)
 *   atelierAmount    = confectionAmount - commissionAmount  (part de l'atelier)
 *
 * La livraison n'est PAS incluse ici (elle reste gérée par le circuit habituel).
 */
@Entity('atelier_order_charges')
@Index('idx_aoc_order', ['orderId'])
@Index('idx_aoc_company', ['companyId'])
export class AtelierOrderChargeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  orderId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  companyId: string | null;

  /** Prix de base du/des modèle(s) (hors taille) */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  baseAmount: number;

  /** Supplément dû à la taille */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  sizeSurcharge: number;

  /** Montant de confection = base + taille */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  confectionAmount: number;

  /** Taux de commission appliqué (%) */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  commissionRate: number;

  /** Part plateforme */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  commissionAmount: number;

  /** Part atelier (net) */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  atelierAmount: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
