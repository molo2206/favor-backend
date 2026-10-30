import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import { MediaUnit } from '../media.enums';
import { MediaProject } from './media-project.entity';
import { MediaServiceEntity } from './media-service.entity';

/** Ligne du devis / de la commande d'un projet */
@Entity('bo_media_project_items')
@Index('idx_bo_media_item_project', ['projectId'])
export class MediaProjectItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  projectId: string;

  @ManyToOne(() => MediaProject, (p) => p.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: MediaProject;

  @Column({ type: 'varchar', length: 36, nullable: true })
  serviceId?: string | null;

  @ManyToOne(() => MediaServiceEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'serviceId' })
  service?: MediaServiceEntity | null;

  @Column({ type: 'varchar', length: 200 })
  label: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1, transformer: decimalNumber })
  quantity: number;

  @Column({ type: 'enum', enum: MediaUnit, default: MediaUnit.SESSION })
  unit: MediaUnit;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  total: number;

  @Column({ type: 'int', default: 0 })
  position: number;
}
