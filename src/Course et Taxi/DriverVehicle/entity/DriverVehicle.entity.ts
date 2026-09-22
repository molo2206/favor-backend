import { CategoryEntity } from 'src/category/entities/category.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

@Entity('driver_vehicles')
@Index(['driverId'])
export class DriverVehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UserEntity, (user) => user.vehicles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'driverId' })
  driver: UserEntity;

  @Column()
  driverId: string;

  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'categoryId' })
  category: CategoryEntity;

  @Column()
  categoryId: string;

  @Column()
  model: string;

  @Column()
  plateNumber: string;

  @Column()
  color: string;

  @Column()
  year: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isDefault: boolean;

  //  KYC FIELDS (ESSENTIAL)
  @Column({ nullable: true })
  registrationUrl: string; // Carte grise

  @Column({ nullable: true })
  assuranceUrl: string; // Assurance

  @Column({ nullable: true })
  permiUrl: string;

  @Column('simple-array', { nullable: true })
  photos: string[];

  @Column({
    type: 'enum',
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING',
  })
  kycStatus: 'PENDING' | 'APPROVED' | 'REJECTED';

  @Column({ nullable: true })
  kycRejectionReason: string;

  @Column({ nullable: true })
  kycSubmittedAt: Date;

  @Column({ nullable: true })
  kycReviewedAt: Date;
}
