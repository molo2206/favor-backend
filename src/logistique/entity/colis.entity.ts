import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { ColisStatus } from '../enum/colis-status.enum';

@Entity('colis')
export class ColisEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  pickupAddress: string;

  @Column()
  deliveryAddress: string;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  price?: number;

  @Column('float', { nullable: true })
  weight?: number;

  @Column('float', { nullable: true })
  length?: number;

  @Column('float', { nullable: true })
  width?: number;

  @Column('float', { nullable: true })
  height?: number;

  @Column({
    type: 'enum',
    enum: ColisStatus,
    default: ColisStatus.PENDING,
  })
  status: ColisStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
