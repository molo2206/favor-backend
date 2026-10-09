import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeEntity } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
    constructor(
        @InjectRepository(EmployeeEntity)
        private readonly employeeRepo: Repository<EmployeeEntity>,
    ) { }

    async create(dto: CreateEmployeeDto) {
        const employee = this.employeeRepo.create({
            ...dto,
            hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
        });
        return this.employeeRepo.save(employee);
    }

    async findAll(filters: {
        companyId?: string;
        branchId?: string;
        departmentId?: string;
        status?: string;
        search?: string;
        page?: number;
        limit?: number;
    }) {
        const { companyId, branchId, departmentId, status, search, page = 1, limit = 20 } = filters;
        const qb = this.employeeRepo
            .createQueryBuilder('e')
            .leftJoinAndSelect('e.department', 'department')
            .leftJoinAndSelect('e.company', 'company')
            .leftJoinAndSelect('e.branch', 'branch')
            .orderBy('e.createdAt', 'DESC');

        if (companyId) qb.andWhere('e.companyId = :companyId', { companyId });
        if (branchId) qb.andWhere('e.branchId = :branchId', { branchId });
        if (departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId });
        if (status) qb.andWhere('e.status = :status', { status });
        if (search) {
            qb.andWhere('(e.fullName LIKE :s OR e.email LIKE :s OR e.phone LIKE :s)', { s: `%${search}%` });
        }

        qb.skip((page - 1) * limit).take(limit);
        const [data, total] = await qb.getManyAndCount();
        return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async findOne(id: string) {
        const e = await this.employeeRepo.findOne({
            where: { id },
            relations: ['department', 'company', 'branch', 'user'],
        });
        if (!e) throw new NotFoundException('Employé introuvable');
        return e;
    }

    async update(id: string, dto: UpdateEmployeeDto) {
        const e = await this.findOne(id);
        Object.assign(e, {
            ...dto,
            ...(dto.hireDate && { hireDate: new Date(dto.hireDate) }),
        });
        return this.employeeRepo.save(e);
    }

    async remove(id: string) {
        const e = await this.findOne(id);
        await this.employeeRepo.remove(e);
    }
}