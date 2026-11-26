import { City } from 'src/company/entities/city.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('service_zones')
export class ServiceZone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => City, (city) => city.zones, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cityId' })
  city: City;

  @Column({
    type: 'varchar',
    length: 36,
    collation: 'utf8mb4_unicode_ci',
  })
  cityId: string;

  @Column()
  name: string;

  @Column('json')
  polygon: { lat: number; lng: number }[];

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  centerLat: number;

  @Column('decimal', { precision: 10, scale: 7, nullable: true })
  centerLng: number;

  @Column({ nullable: true })
  radius: number;

  @Column({ default: true })
  isActive: boolean;
}
