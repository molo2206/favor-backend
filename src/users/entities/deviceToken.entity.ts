import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('device_tokens')
@Unique(['token']) // correspond à @unique sur Prisma
export class DeviceTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ unique: true })
  token: string;

  @Column({ nullable: true })
  platform?: string; // ios, android, web

  @ManyToOne(() => UserEntity, (user) => user.deviceTokens, {
    onDelete: 'CASCADE',
  })
  user: UserEntity;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
