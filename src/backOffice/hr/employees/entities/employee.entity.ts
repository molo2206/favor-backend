import {
    Column, CreateDateColumn, Entity, Index, JoinColumn,
    ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { DepartmentEntity } from '../../departments/entities/department.entity';
import { EmployeeStatus } from '../../common/enums/employee-status.enum';

@Entity('hr_employees')
export class EmployeeEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Lien optionnel vers User (si l'employé a un compte)
    @ManyToOne(() => UserEntity, { nullable: true })
    @JoinColumn({ name: 'userId' })
    user?: UserEntity;

    @Index('idx_hr_employees_user')
    @Column({ nullable: true })
    userId?: string;

    @Column()
    fullName: string;

    @Column({ nullable: true })
    email?: string;

    @Column({ nullable: true })
    phone?: string;

    @Column({ nullable: true })
    address?: string;

    @Column({ nullable: true })
    position?: string;

    @Column({ type: 'timestamp', nullable: true })
    hireDate?: Date;

    @Column({ type: 'enum', enum: EmployeeStatus, default: EmployeeStatus.ACTIVE })
    status: EmployeeStatus;

    @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
    baseSalary?: number;

    @Column({ nullable: true })
    currency?: string;

    @Column({ nullable: true })
    image?: string;

    @ManyToOne(() => DepartmentEntity, { nullable: true })
    @JoinColumn({ name: 'departmentId' })
    department?: DepartmentEntity;

    @Index('idx_hr_employees_department')
    @Column({ nullable: true })
    departmentId?: string;

    @ManyToOne(() => CompanyEntity, { nullable: true })
    @JoinColumn({ name: 'companyId' })
    company?: CompanyEntity;

    @Index('idx_hr_employees_company')
    @Column({ nullable: true })
    companyId?: string;

    @ManyToOne(() => BranchEntity, { nullable: true })
    @JoinColumn({ name: 'branchId' })
    branch?: BranchEntity;

    @Index('idx_hr_employees_branch')
    @Column({ nullable: true })
    branchId?: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}