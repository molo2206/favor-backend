import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveEntity } from './entities/leave.entity';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';
import { LeaveStatus } from '../common/enums/leave-status.enum';

@Injectable()
export class LeavesService {
    constructor(
        @InjectRepository(LeaveEntity)
        private readonly leaveRepo: Repository<LeaveEntity>,
    ) { }

    async create(dto: CreateLeaveDto) {
        const leave = this.leaveRepo.create({
            ...dto,
            startDate: new Date(dto.startDate),
            endDate: new Date(dto.endDate),
        });
        return this.leaveRepo.save(leave);
    }

    async findAll(filters: {
        employeeId?: string;
        status?: LeaveStatus;
        page?: number;
        limit?: number;
    }) {
        const { employeeId, status, page = 1, limit = 20 } = filters;
        const qb = this.leaveRepo
            .createQueryBuilder('l')
            .leftJoinAndSelect('l.employee', 'employee')
            .leftJoinAndSelect('l.approvedBy', 'approvedBy')
            .orderBy('l.createdAt', 'DESC');

        if (employeeId) qb.andWhere('l.employeeId = :employeeId', { employeeId });
        if (status) qb.andWhere('l.status = :status', { status });

        qb.skip((page - 1) * limit).take(limit);
        const [data, total] = await qb.getManyAndCount();
        return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async findOne(id: string) {
        const leave = await this.leaveRepo.findOne({
            where: { id },
            relations: ['employee', 'approvedBy'],
        });
        if (!leave) throw new NotFoundException('Congé introuvable');
        return leave;
    }

    async updateStatus(id: string, dto: UpdateLeaveDto, approvedById?: string) {
        const leave = await this.findOne(id);
        leave.status = dto.status!;
        if (dto.status === LeaveStatus.APPROVED) {
            leave.approvedById = approvedById;
            leave.approvedAt = new Date();
        } else if (dto.status === LeaveStatus.REJECTED) {
            leave.rejectionReason = dto.rejectionReason;
        }
        return this.leaveRepo.save(leave);
    }

    async remove(id: string) {
        const leave = await this.findOne(id);
        await this.leaveRepo.remove(leave);
    }
}