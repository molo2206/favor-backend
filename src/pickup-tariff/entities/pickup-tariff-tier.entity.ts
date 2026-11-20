import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PickupTariffEntity } from './pickup-tariff.entity';

/**
 * ✅ Palier d'un tarif de ramassage : [minValue … maxValue] → price.
 *   Ex. « 1–10 = 2$ » : minValue=1, maxValue=10, price=2.
 *   maxValue NULL = « et au-delà » (dernier palier ouvert, ex. 51+ = 10$).
 */
@Entity('pickup_tariff_tiers')
@Index('idx_pickup_tariff_tiers_tariff', ['tariffId'])
export class PickupTariffTierEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PickupTariffEntity, (t) => t.tiers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tariffId' })
  tariff: PickupTariffEntity;

  @Column({ type: 'varchar', length: 36 })
  tariffId: string;

  /** Borne basse incluse (ex. 1, 11, 21…) */
  @Column({ type: 'int' })
  minValue: number;

  /** Borne haute incluse (NULL = palier ouvert « et au-delà ») */
  @Column({ type: 'int', nullable: true })
  maxValue?: number | null;

  /** Prix du ramassage pour ce palier (dans la devise du tarif) */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
