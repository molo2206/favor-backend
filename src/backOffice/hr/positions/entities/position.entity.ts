import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { DepartmentEntity } from '../../departments/entities/department.entity';

export enum PositionStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('hr_positions')
export class PositionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({
    type: 'enum',
    enum: PositionStatus,
    default: PositionStatus.ACTIVE,
  })
  status: PositionStatus;

  // ============================================================
  // 🔗 RELATION : Department
  // ============================================================
  @ManyToOne(() => DepartmentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'departmentId' })
  department?: DepartmentEntity;

  @Index('idx_hr_positions_department')
  @Column({ nullable: true })
  departmentId?: string;

  // ============================================================
  // 🔗 RELATION : Company
  // ============================================================
  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'companyId' })
  company?: CompanyEntity;

  @Index('idx_hr_positions_company')
  @Column({ nullable: true })
  companyId?: string;

  // ============================================================
  // 🔗 RELATION : Manager (user qui gère ce poste)
  // ============================================================
  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'managerId' })
  manager?: UserEntity;

  @Index('idx_hr_positions_manager')
  @Column({ nullable: true })
  managerId?: string;

  // ============================================================
  // 🔗 RELATION : CreatedBy / UpdatedBy
  // ============================================================
  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy?: UserEntity;

  @Column({ nullable: true })
  createdById?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updatedById' })
  updatedBy?: UserEntity;

  @Column({ nullable: true })
  updatedById?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}