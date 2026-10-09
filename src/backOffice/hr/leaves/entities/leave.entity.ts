import {
  Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { EmployeeEntity } from '../../employees/entities/employee.entity';
import { LeaveType } from '../../common/enums/leave-type.enum';
import { LeaveStatus } from '../../common/enums/leave-status.enum';

@Entity('hr_leaves')
export class LeaveEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => EmployeeEntity, { nullable: false })
  @JoinColumn({ name: 'employeeId' })
  employee: EmployeeEntity;

  @Index('idx_hr_leaves_employee')
  @Column()
  employeeId: string;

  @Column({ type: 'enum', enum: LeaveType })
  type: LeaveType;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp' })
  endDate: Date;

  @Column({ type: 'int' })
  days: number;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ type: 'enum', enum: LeaveStatus, default: LeaveStatus.PENDING })
  status: LeaveStatus;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'approvedById' })
  approvedBy?: UserEntity;

  @Column({ nullable: true })
  approvedById?: string;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}