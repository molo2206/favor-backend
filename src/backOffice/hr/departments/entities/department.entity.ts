import {
    Column, CreateDateColumn, Entity, Index, JoinColumn,
    ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { UserEntity } from 'src/users/entities/user.entity';

@Entity('hr_departments')
export class DepartmentEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ nullable: true, type: 'text' })
    description?: string;

    @ManyToOne(() => DepartmentEntity, { nullable: true })
    @JoinColumn({ name: 'parentDepartmentId' })
    parentDepartment?: DepartmentEntity;

    @Index('idx_hr_departments_parent')
    @Column({ nullable: true })
    parentDepartmentId?: string;

    @ManyToOne(() => UserEntity, { nullable: true })
    @JoinColumn({ name: 'managerId' })
    manager?: UserEntity;

    @Column({ nullable: true })
    managerId?: string;

    @ManyToOne(() => CompanyEntity, { nullable: true })
    @JoinColumn({ name: 'companyId' })
    company?: CompanyEntity;

    @Index('idx_hr_departments_company')
    @Column({ nullable: true })
    companyId?: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}