import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { SupplyEventType } from '../enums/supply.enum';
import { Supply } from './supply.entity';

/**
 * Historique complet d'un Supply : commande, shipment, LTA, tracking, branches, retraits…
 * Une ligne par événement, jamais modifiée.
 */
@Entity('supply_history')
@Index('idx_supply_history_supply_date', ['supplyId', 'createdAt'])
export class SupplyHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  supplyId: string;

  @ManyToOne(() => Supply, (s) => s.history, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supplyId' })
  supply: Supply;

  @Column({ type: 'enum', enum: SupplyEventType })
  eventType: SupplyEventType;

  @Column({ type: 'varchar', length: 50, nullable: true })
  fromStatus?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  toStatus?: string | null;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  orderId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index('idx_supply_history_shipment')
  shipmentId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  ltaId?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  branchId?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location?: string | null;

  /** Détails techniques (ids, quantités…) */
  @Column({ type: 'json', nullable: true })
  payload?: Record<string, any> | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  performedById?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'performedById' })
  performedBy?: UserEntity | null;

  @CreateDateColumn()
  createdAt: Date;
}
