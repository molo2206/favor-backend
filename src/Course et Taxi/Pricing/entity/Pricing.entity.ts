import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
} from 'typeorm';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { City } from 'src/company/entities/city.entity';

@Entity('pricings')
// ✅ Garder l'index unique sur la combinaison
@Index(['cityId', 'categoryId'], { unique: true })
export class Pricing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => City)
  @JoinColumn({ name: 'cityId' })
  city: City;

  @Column({ type: 'varchar', length: 36 })
  cityId: string;

  @ManyToOne(() => CategoryEntity, (category) => category.pricings)
  @JoinColumn({ name: 'categoryId' })
  category: CategoryEntity;

  @Column({ type: 'varchar', length: 36 })
  categoryId: string;

  @Column('decimal', { precision: 10, scale: 2 })
  baseFare: number;

  @Column('decimal', { precision: 10, scale: 2 })
  pricePerKm: number;

  @Column('decimal', { precision: 10, scale: 2 })
  pricePerMinute: number;

  @Column('decimal', { precision: 10, scale: 2 })
  minimumFare: number;

  @Column('decimal', { precision: 5, scale: 2 })
  commissionRate: number;

  @Column({ default: true })
  isActive: boolean;
}