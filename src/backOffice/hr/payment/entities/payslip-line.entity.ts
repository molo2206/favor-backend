// src/hr/payroll/entities/payslip-line.entity.ts
import {
  Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { PayslipEntity } from './payslip.entity';

export enum PayslipLineType {
  EARNING = 'EARNING',     // Gain (prime, bonus, heures sup...)
  DEDUCTION = 'DEDUCTION', // Retenue (taxe, cotisation, avance...)
}

@Entity('hr_payslip_lines')
export class PayslipLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PayslipEntity, (p) => p.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payslipId' })
  payslip: PayslipEntity;

  @Index('idx_hr_payslip_lines_payslip')
  @Column()
  payslipId: string;

  @Column({ type: 'enum', enum: PayslipLineType })
  type: PayslipLineType;

  @Column()
  code: string; // ex: 'BASE', 'PRIME', 'CNSS', 'IMPOT', 'AVANCE'

  @Column()
  label: string; // ex: 'Salaire de base', 'Cotisation CNSS', etc.

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  rate?: number; // Taux en % (ex: 5.00 pour 5%)

  @Column({ type: 'text', nullable: true })
  notes?: string;
}