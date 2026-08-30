import { UserEntity } from "src/users/entities/user.entity";
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('driver_locations')
@Index(['driverId'])
export class DriverLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'driverId' })
  driver: UserEntity;

  @Column()
  driverId: string;

  @Column('decimal', { precision: 10, scale: 7 })
  lat: number;

  @Column('decimal', { precision: 10, scale: 7 })
  lng: number;

  @Column({ default: true })
  isOnline: boolean;

  @Column({ default: false })
  isBusy: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
