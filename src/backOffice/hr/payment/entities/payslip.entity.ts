// src/hr/payroll/entities/payslip.entity.ts
import {
  Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { EmployeeEntity } from '../../employees/entities/employee.entity';
import { PayrollRunEntity } from './payroll-run.entity';
import { AgentPaymentEntity } from './agent-payment.entity';
import { PayslipLineEntity } from './payslip-line.entity';

export enum PayslipStatus {
  DRAFT = 'DRAFT',
  VALIDATED = 'VALIDATED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

@Entity('hr_payslips')
export class PayslipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_hr_payslips_reference', { unique: true })
  @Column()
  reference: string; // ex: PAY-202610-0001-EMP001

  @ManyToOne(() => PayrollRunEntity, (run) => run.payslips, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payrollRunId' })
  payrollRun: PayrollRunEntity;

  @Index('idx_hr_payslips_payroll_run')
  @Column()
  payrollRunId: string;

  @ManyToOne(() => EmployeeEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: EmployeeEntity;

  @Index('idx_hr_payslips_employee')
  @Column()
  employeeId: string;

  @Column({ length: 20 })
  period: string;

  @Column({ type: 'date' })
  periodStart: Date;

  @Column({ type: 'date' })
  periodEnd: Date;

  @Column({ default: 'CDF' })
  currency: string;

  // ============================================================
  // 💰 MONTANTS CALCULÉS
  // ============================================================
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  baseSalary: number;        // Salaire de base de l'employé

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalEarnings: number;     // Somme des gains (primes, bonus...)

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalDeductions: number;   // Somme des retenues (taxes, avances...)

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  grossSalary: number;       // baseSalary + totalEarnings

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  netSalary: number;         // grossSalary - totalDeductions

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  advancesDeducted: number;  // Total des avances déduites

  // ============================================================
  // 📊 STATUT & MÉTADONNÉES
  // ============================================================
  @Column({ type: 'enum', enum: PayslipStatus, default: PayslipStatus.DRAFT })
  status: PayslipStatus;

  @Column({ type: 'timestamp', nullable: true })
  paidAt?: Date;

  // Lien vers le paiement effectif (AgentPaymentEntity)
  @ManyToOne(() => AgentPaymentEntity, { nullable: true })
  @JoinColumn({ name: 'paymentId' })
  payment?: AgentPaymentEntity;

  @Column({ nullable: true })
  paymentId?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @OneToMany(() => PayslipLineEntity, (line) => line.payslip, {
    cascade: true,
    eager: true,
  })
  lines: PayslipLineEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}