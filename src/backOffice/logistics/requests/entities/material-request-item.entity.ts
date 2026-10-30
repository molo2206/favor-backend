import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Asset } from '../../assets/entities/asset.entity';
import { AssetCategory } from '../../assets/entities/asset-category.entity';
import { MaterialRequest } from './material-request.entity';

/** Ligne d'une demande : un bien précis, ou une catégorie (« 2 chaises »), ou un texte libre */
@Entity('bo_material_request_items')
@Index('idx_bo_material_request_item_request', ['requestId'])
export class MaterialRequestItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  requestId: string;

  @ManyToOne(() => MaterialRequest, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requestId' })
  request: MaterialRequest;

  /** Bien précis demandé (facultatif) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  assetId?: string | null;

  @ManyToOne(() => Asset, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assetId' })
  asset?: Asset | null;

  /** Catégorie demandée (facultatif) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  categoryId?: string | null;

  @ManyToOne(() => AssetCategory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category?: AssetCategory | null;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'int', default: 1 })
  quantityRequested: number;

  /** Quantité accordée par le logisticien (null = pas encore examinée) */
  @Column({ type: 'int', nullable: true })
  quantityApproved?: number | null;

  @Column({ type: 'int', default: 0 })
  quantityIssued: number;
}
