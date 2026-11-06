// src/hr/payroll/entities/payroll-run.entity.ts
import {
  Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { PayslipEntity } from './payslip.entity';

export enum PayrollRunStatus {
  DRAFT = 'DRAFT',           // En préparation
  VALIDATED = 'VALIDATED',   // Validé mais pas payé
  PAID = 'PAID',             // Payé
  CANCELLED = 'CANCELLED',   // Annulé
}

@Entity('hr_payroll_runs')
export class PayrollRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_hr_payroll_runs_reference', { unique: true })
  @Column()
  reference: string; // ex: PAY-202610-0001

  @Index('idx_hr_payroll_runs_period')
  @Column({ length: 20 })
  period: string; // ex: '2026-10'

  @Column({ type: 'date' })
  periodStart: Date;

  @Column({ type: 'date' })
  periodEnd: Date;

  @ManyToOne(() => CompanyEntity, { nullable: true })
  @JoinColumn({ name: 'companyId' })
  company?: CompanyEntity;

  @Index('idx_hr_payroll_runs_company')
  @Column({ nullable: true })
  companyId?: string;

  @ManyToOne(() => BranchEntity, { nullable: true })
  @JoinColumn({ name: 'branchId' })
  branch?: BranchEntity;

  @Index('idx_hr_payroll_runs_branch')
  @Column({ nullable: true })
  branchId?: string;

  @Column({ type: 'enum', enum: PayrollRunStatus, default: PayrollRunStatus.DRAFT })
  status: PayrollRunStatus;

  // Totaux agrégés (pour affichage rapide)
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalGross: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalDeductions: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalNet: number;

  @Column({ type: 'int', default: 0 })
  employeeCount: number;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy?: UserEntity;

  @Column({ nullable: true })
  createdById?: string;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'validatedById' })
  validatedBy?: UserEntity;

  @Column({ nullable: true })
  validatedById?: string;

  @Column({ type: 'timestamp', nullable: true })
  validatedAt?: Date;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'paidById' })
  paidBy?: UserEntity;

  @Column({ nullable: true })
  paidById?: string;

  @Column({ type: 'timestamp', nullable: true })
  paidAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @OneToMany(() => PayslipEntity, (payslip) => payslip.payrollRun)
  payslips: PayslipEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}