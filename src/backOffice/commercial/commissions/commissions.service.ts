import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommissionEntity } from './entities/commission.entity';
import { CommissionStatus } from '../common/enums/commission-status.enum';

@Injectable()
export class CommissionsService {
    constructor(
        @InjectRepository(CommissionEntity)
        private readonly commissionRepo: Repository<CommissionEntity>,
    ) { }

    async create(data: {
        salesRepId: string;
        saleAmount: number;
        commissionRate: number;
        currency?: string;
        sourceId?: string;
        sourceType?: string;
    }): Promise<CommissionEntity> {
        const commissionAmount = (data.saleAmount * data.commissionRate) / 100;
        const commission = this.commissionRepo.create({
            salesRepId: data.salesRepId,
            saleAmount: data.saleAmount,
            commissionRate: data.commissionRate,
            commissionAmount: Number(commissionAmount.toFixed(2)),
            currency: data.currency || 'USD',
            sourceId: data.sourceId,
            sourceType: data.sourceType,
            status: CommissionStatus.PENDING,
        });
        return this.commissionRepo.save(commission);
    }

    async findAll(filters: {
        salesRepId?: string;
        status?: CommissionStatus;
        page?: number;
        limit?: number;
    }) {
        const { salesRepId, status, page = 1, limit = 20 } = filters;
        const qb = this.commissionRepo
            .createQueryBuilder('c')
            .leftJoinAndSelect('c.salesRep', 'salesRep')
            .orderBy('c.createdAt', 'DESC');

        if (salesRepId) qb.andWhere('c.salesRepId = :salesRepId', { salesRepId });
        if (status) qb.andWhere('c.status = :status', { status });

        qb.skip((page - 1) * limit).take(limit);
        const [data, total] = await qb.getManyAndCount();
        return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async findOne(id: string): Promise<CommissionEntity> {
        const c = await this.commissionRepo.findOne({
            where: { id },
            relations: ['salesRep'],
        });
        if (!c) throw new NotFoundException('Commission introuvable');
        return c;
    }

    async updateStatus(id: string, status: CommissionStatus) {
        const c = await this.findOne(id);
        c.status = status;
        return this.commissionRepo.save(c);
    }

    async getTotalBySalesRep(salesRepId: string) {
        return this.commissionRepo
            .createQueryBuilder('c')
            .select('c.status', 'status')
            .addSelect('SUM(c.commissionAmount)', 'total')
            .addSelect('c.currency', 'currency')
            .where('c.salesRepId = :salesRepId', { salesRepId })
            .groupBy('c.status')
            .addGroupBy('c.currency')
            .getRawMany();
    }
}