// search-history.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('search_history')
export class SearchHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  @Index()
  search_term: string;

  @Column({ length: 255, nullable: true })
  place_id: string;

  @Column({ length: 500, nullable: true })
  selected_address: string;

  @Column({ default: 0 })
  search_count: number;

  @CreateDateColumn()
  first_searched_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_searched_at: Date;
}