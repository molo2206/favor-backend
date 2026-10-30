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

import { EmployeeEntity } from '../../employees/entities/employee.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentType } from '../enums/payment-type.enum';

@Entity('hr_agent_payments')
export class AgentPaymentEntity {
  // ============================================================
  // 🔑 IDENTIFIANT
  // ============================================================
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ============================================================
  // 🔗 RELATIONS
  // ============================================================
  @ManyToOne(() => EmployeeEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: EmployeeEntity;

  @Index('idx_hr_agent_payments_employee')
  @Column()
  employeeId: string;

  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'companyId' })
  company?: CompanyEntity;

  @Index('idx_hr_agent_payments_company')
  @Column({ nullable: true })
  companyId?: string;

  @ManyToOne(() => BranchEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branchId' })
  branch?: BranchEntity;

  @Index('idx_hr_agent_payments_branch')
  @Column({ nullable: true })
  branchId?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'paidById' })
  paidBy?: UserEntity;

  @Index('idx_hr_agent_payments_paid_by')
  @Column({ nullable: true })
  paidById?: string;

  // ============================================================
  // 📌 TYPE DE PAIEMENT (SALARY / ADVANCE / REFUND / BONUS / PENALTY)
  // ============================================================
  @Index('idx_hr_agent_payments_type')
  @Column({
    type: 'enum',
    enum: PaymentType,
    default: PaymentType.SALARY,
  })
  type: PaymentType;

  // ============================================================
  // 💰 MONTANTS
  // ============================================================
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  bonus: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  deduction: number;

  // ✅ Montant total des avances déduites sur ce salaire
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  advanceDeducted: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  netAmount: number;

  @Column({ default: 'CDF' })
  currency: string;

  // ============================================================
  // 🔗 RÉFÉRENCE POUR REMBOURSEMENT D'AVANCE
  // ============================================================
  @ManyToOne(() => AgentPaymentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'relatedPaymentId' })
  relatedPayment?: AgentPaymentEntity;

  @Index('idx_hr_agent_payments_related')
  @Column({ nullable: true })
  relatedPaymentId?: string;

  // ============================================================
  // 📅 PÉRIODES & MÉTHODES
  // ============================================================
  @Column({ type: 'varchar', length: 20, nullable: true })
  period?: string; // ex: '2026-10', 'WEEK-42'

  @Column({ type: 'date', nullable: true })
  periodStart?: Date;

  @Column({ type: 'date', nullable: true })
  periodEnd?: Date;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.CASH })
  method: PaymentMethod;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'timestamp', nullable: true })
  paidAt?: Date;

  // ============================================================
  // 📝 DÉTAILS
  // ============================================================
  @Column({ type: 'varchar', length: 255, nullable: true })
  reference?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  // ============================================================
  // 🕒 TIMESTAMPS
  // ============================================================
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}