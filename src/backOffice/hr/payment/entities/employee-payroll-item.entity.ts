// src/hr/payroll/entities/employee-payroll-item.entity.ts
import {
  Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { EmployeeEntity } from '../../employees/entities/employee.entity';
import { PayrollItemEntity } from './payroll-item.entity';

@Entity('hr_employee_payroll_items')
export class EmployeePayrollItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => EmployeeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: EmployeeEntity;

  @Index('idx_hr_emp_payroll_items_employee')
  @Column()
  employeeId: string;

  @ManyToOne(() => PayrollItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payrollItemId' })
  payrollItem: PayrollItemEntity;

  @Index('idx_hr_emp_payroll_items_item')
  @Column()
  payrollItemId: string;

  @Column({ default: true })
  isActive: boolean;

  // Surcharge optionnelle de la valeur définie dans PayrollItemEntity
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  overrideValue?: number;
}