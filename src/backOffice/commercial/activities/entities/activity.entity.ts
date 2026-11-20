import {
  Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { ProspectEntity } from '../../prospects/entities/prospect.entity';
import { ActivityType } from '../../common/enums/activity-type.enum';

@Entity('commercial_activities')
export class ActivityEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ActivityType })
  type: ActivityType;

  @Column()
  subject: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  result?: string;

  @Column({ type: 'timestamp' })
  date: Date;

  @Column({ type: 'text', nullable: true })
  nextAction?: string;

  @Column({ type: 'timestamp', nullable: true })
  nextActionAt?: Date;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'salesRepId' })
  salesRep: UserEntity;

  @Index('idx_activities_sales_rep')
  @Column()
  salesRepId: string;

  @ManyToOne(() => ProspectEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'prospectId' })
  prospect?: ProspectEntity;

  @Index('idx_activities_prospect')
  @Column({ nullable: true })
  prospectId?: string;

  // ✅ Customer = UserEntity
  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customerId' })
  customer?: UserEntity;

  @Index('idx_activities_customer')
  @Column({ nullable: true })
  customerId?: string;

  // ✅ userId (FK existante fk_activities_user)
  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;

  @Column({ nullable: true })
  userId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}