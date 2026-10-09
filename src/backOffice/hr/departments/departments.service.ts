import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentEntity } from './entities/department.entity';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
    constructor(
        @InjectRepository(DepartmentEntity)
        private readonly deptRepo: Repository<DepartmentEntity>,
    ) { }

    async create(dto: CreateDepartmentDto) {
        const dept = this.deptRepo.create(dto);
        return this.deptRepo.save(dept);
    }

    async findAll(companyId?: string) {
        const qb = this.deptRepo
            .createQueryBuilder('d')
            .leftJoinAndSelect('d.manager', 'manager')
            .leftJoinAndSelect('d.parentDepartment', 'parentDepartment')
            .leftJoinAndSelect('d.company', 'company')
            .orderBy('d.createdAt', 'DESC');

        if (companyId) qb.andWhere('d.companyId = :companyId', { companyId });

        return qb.getMany();
    }

    async findOne(id: string) {
        const dept = await this.deptRepo.findOne({
            where: { id },
            relations: ['manager', 'parentDepartment', 'company'],
        });
        if (!dept) throw new NotFoundException('Département introuvable');
        return dept;
    }

    async update(id: string, dto: UpdateDepartmentDto) {
        const dept = await this.findOne(id);
        Object.assign(dept, dto);
        return this.deptRepo.save(dept);
    }

    async remove(id: string) {
        const dept = await this.findOne(id);
        await this.deptRepo.remove(dept);
    }
}