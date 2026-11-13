import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Asset } from 'src/backOffice/logistics/assets/entities/asset.entity';
import { MediaSession } from './media-session.entity';

/** Matériel réservé pour une séance — c'est un bien de l'entreprise (logistique interne) */
@Entity('bo_media_session_equipment')
@Unique('uq_bo_media_equipment', ['sessionId', 'assetId'])
@Index('idx_bo_media_equipment_asset', ['assetId'])
export class MediaSessionEquipment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  sessionId: string;

  @ManyToOne(() => MediaSession, (s) => s.equipment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: MediaSession;

  @Column({ type: 'varchar', length: 36 })
  assetId: string;

  @ManyToOne(() => Asset, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset: Asset;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
