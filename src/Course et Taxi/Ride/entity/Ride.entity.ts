import { CategoryEntity } from 'src/category/entities/category.entity';
import { City } from 'src/company/entities/city.entity';
import { RideStatus } from 'src/Course et Taxi/Ride/enum/RideStatus.enum';
import { UserEntity } from 'src/users/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('rides')
@Index(['status'])
@Index(['driverId'])
@Index(['riderId'])
@Index(['cityId'])
export class Ride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Rider (obligatoire)
  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'riderId' })
  rider: UserEntity;

  @Column({ type: 'varchar', length: 36 })
  riderId: string;

  // Driver (optionnel)
  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'driverId' })
  driver: UserEntity;

  @Column({ type: 'varchar', length: 36, nullable: true })
  driverId?: string;

  // Ville
  @ManyToOne(() => City)
  @JoinColumn({ name: 'cityId' })
  city: City;

  @Column({ type: 'varchar', length: 36 })
  cityId: string;

  // Catégorie
  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'categoryId' })
  category: CategoryEntity;

  @Column({ type: 'varchar', length: 36 })
  categoryId: string;

  // Locations
  @Column('json')
  pickupLocation: {
    lat: number;
    lng: number;
    address?: string;
    placeId?: string;
  };

  @Column('json')
  dropoffLocation: {
    lat: number;
    lng: number;
    address?: string;
    placeId?: string;
  };

  // Google
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  distance: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  duration: number;

  @Column({ nullable: true })
  directionsPolyline: string;

  // Prix
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  price: number;

  @Column('decimal', { precision: 5, scale: 2, default: 1 })
  surgeMultiplier: number;

  // Statut
  @Column({
    type: 'enum',
    enum: RideStatus,
    default: RideStatus.PENDING,
  })
  status: RideStatus;

  @Column({ type: 'enum', enum: ['RIDER', 'DRIVER', 'SYSTEM'], nullable: true })
  cancelledBy?: 'RIDER' | 'DRIVER' | 'SYSTEM';

  @Column({ nullable: true, type: 'text' })
  cancellationReason?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}