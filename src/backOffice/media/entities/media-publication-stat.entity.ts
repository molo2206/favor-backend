import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { MediaPublication } from './media-publication.entity';

/**
 * ✅ Relevé saisi par l'admin : les compteurs de la publication à une date
 * (ex. le 24/10 : 1 250 vues, 80 j'aime, 12 commentaires, 5 partages).
 * Un relevé par jour (ressaisir la même date le remplace). Le gain du jour = différence avec le relevé précédent.
 */
@Entity('bo_media_publication_stats')
@Unique('uq_bo_media_publication_stat_day', ['publicationId', 'statDate'])
@Index('idx_bo_media_publication_stat_company', ['companyId', 'statDate'])
export class MediaPublicationStat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  publicationId: string;

  @ManyToOne(() => MediaPublication, (p) => p.stats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'publicationId' })
  publication: MediaPublication;

  @Column({ type: 'date' })
  statDate: string;

  @Column({ type: 'int', default: 0 }) views: number;
  @Column({ type: 'int', default: 0 }) likes: number;
  @Column({ type: 'int', default: 0 }) comments: number;
  @Column({ type: 'int', default: 0 }) shares: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  recordedById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
