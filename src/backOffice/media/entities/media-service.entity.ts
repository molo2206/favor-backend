import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { decimalNumber } from 'src/backOffice/logistics/common/decimal.transformer';
import { MediaServiceCategory, MediaUnit } from '../media.enums';

/** Catalogue des prestations média (shooting photo, couverture vidéo, drone, montage, réseaux sociaux…) */
@Entity('bo_media_services')
@Index('idx_bo_media_service_company', ['companyId', 'isActive'])
export class MediaServiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  code?: string | null;

  @Column({ type: 'enum', enum: MediaServiceCategory, default: MediaServiceCategory.OTHER })
  category: MediaServiceCategory;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'enum', enum: MediaUnit, default: MediaUnit.SESSION })
  unit: MediaUnit;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: decimalNumber })
  unitPrice: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  /** Durée type d'une séance (minutes) */
  @Column({ type: 'int', nullable: true })
  durationMinutes?: number | null;

  /** Ce que le client reçoit (ex. « 100 photos retouchées + vidéo 3 min ») */
  @Column({ type: 'varchar', length: 500, nullable: true })
  deliverables?: string | null;

  /** Délai de livraison après la séance (jours) */
  @Column({ type: 'int', nullable: true })
  deliveryDays?: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl?: string | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
