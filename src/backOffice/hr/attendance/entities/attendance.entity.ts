import {
    Column, CreateDateColumn, Entity, Index, JoinColumn,
    ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { EmployeeEntity } from '../../employees/entities/employee.entity';
import { AttendanceStatus } from '../../common/enums/attendance-status.enum';

@Entity('hr_attendance')
export class AttendanceEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => EmployeeEntity, { nullable: false })
    @JoinColumn({ name: 'employeeId' })
    employee: EmployeeEntity;

    @Index('idx_hr_attendance_employee')
    @Column()
    employeeId: string;

    @Column({ type: 'date' })
    date: Date;

    @Column({ type: 'timestamp', nullable: true })
    checkInAt?: Date;

    @Column({ type: 'timestamp', nullable: true })
    checkOutAt?: Date;

    @Column({ type: 'enum', enum: AttendanceStatus, default: AttendanceStatus.PRESENT })
    status: AttendanceStatus;

    @Column({ type: 'int', nullable: true })
    workedMinutes?: number;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}