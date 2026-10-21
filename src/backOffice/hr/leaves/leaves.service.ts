import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveEntity } from './entities/leave.entity';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';
import { LeaveStatus } from '../common/enums/leave-status.enum';
import { I18nService } from 'src/libs/common/src';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';

@Injectable()
export class LeavesService {
    constructor(
        @InjectRepository(LeaveEntity)
        private readonly leaveRepo: Repository<LeaveEntity>,

        @InjectRepository(EmployeeEntity)
        private readonly employeeRepo: Repository<EmployeeEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepo: Repository<UserEntity>,

        private readonly i18nService: I18nService,
    ) { }

    // ============================================================
    // 🔒 VALIDATIONS PRIVÉES
    // ============================================================
    private async validateEmployee(
        employeeId: string,
        lang: string = 'fr',
    ): Promise<EmployeeEntity> {
        const employee = await this.employeeRepo.findOne({
            where: { id: employeeId },
        });
        if (!employee) {
            throw new NotFoundException(
                await this.i18nService.translate('leave.employee_not_found', lang, {
                    id: employeeId,
                }),
            );
        }
        return employee;
    }

    private async validateUser(
        userId: string,
        lang: string = 'fr',
    ): Promise<UserEntity> {
        const user = await this.userRepo.findOne({
            where: { id: userId },
        });
        if (!user) {
            throw new NotFoundException(
                await this.i18nService.translate('leave.user_not_found', lang, {
                    id: userId,
                }),
            );
        }
        return user;
    }

    // ============================================================
    // ➕ CREATE
    // ============================================================
    async create(
        dto: CreateLeaveDto,
        user: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: LeaveEntity }> {
        // 1. Vérifier que l'employé existe
        await this.validateEmployee(dto.employeeId, lang);

        // 2. Vérifier la cohérence des dates
        const startDate = new Date(dto.startDate);
        const endDate = new Date(dto.endDate);
        if (endDate < startDate) {
            throw new BadRequestException(
                await this.i18nService.translate('leave.end_before_start', lang),
            );
        }

        // 3. Créer
        const leave = this.leaveRepo.create({
            ...dto,
            startDate,
            endDate,
            reason: dto.reason?.trim(),
            status: LeaveStatus.PENDING,
        });

        const saved = await this.leaveRepo.save(leave);

        return {
            message: await this.i18nService.translate('leave.created_success', lang, {
                employeeName: (saved as any).employee?.fullName ?? '',
            }),
            data: saved,
        };
    }

    // ============================================================
    // 📋 FIND ALL
    // ============================================================
    async findAll(
        filters: {
            employeeId?: string;
            status?: LeaveStatus;
            search?: string;
            page?: number;
            limit?: number;
        },
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<LeaveEntity>;
    }> {
        const safePage = Math.max(1, Number(filters.page) || 1);
        const safeLimit = Math.min(
            Math.max(1, Number(filters.limit) || 20),
            100,
        );
        const skip = (safePage - 1) * safeLimit;

        const qb = this.leaveRepo
            .createQueryBuilder('l')
            .leftJoinAndSelect('l.employee', 'employee')
            .leftJoinAndSelect('l.approvedBy', 'approvedBy')
            .orderBy('l.createdAt', 'DESC');

        // 🔍 Filtres
        if (filters.employeeId?.trim()) {
            qb.andWhere('l.employeeId = :employeeId', {
                employeeId: filters.employeeId.trim(),
            });
        }
        if (filters.status) {
            qb.andWhere('l.status = :status', { status: filters.status });
        }
        if (filters.search?.trim()) {
            const s = `%${filters.search.trim()}%`;
            qb.andWhere(
                `(
                    LOWER(employee.fullName) LIKE LOWER(:s)
                    OR LOWER(l.reason) LIKE LOWER(:s)
                )`,
                { s },
            );
        }

        // 📄 Pagination
        qb.skip(skip).take(safeLimit);

        const [leaves, total] = await qb.getManyAndCount();

        const paginated = new PaginatedResponseDto(
            leaves,
            total,
            safePage,
            safeLimit,
        );

        return {
            message:
                total > 0
                    ? await this.i18nService.translate('leave.list_retrieved', lang)
                    : await this.i18nService.translate('leave.not_found', lang),
            data: paginated,
        };
    }

    // ============================================================
    // 🔍 FIND ONE
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: LeaveEntity }> {
        const leave = await this.leaveRepo.findOne({
            where: { id },
            relations: ['employee', 'approvedBy'],
        });
        if (!leave) {
            throw new NotFoundException(
                await this.i18nService.translate('leave.not_found_by_id', lang, { id }),
            );
        }

        return {
            message: await this.i18nService.translate('leave.found_success', lang, {
                id: leave.id,
            }),
            data: leave,
        };
    }

    // ============================================================
    // ✏️ UPDATE STATUS
    // ============================================================
    async updateStatus(
        id: string,
        dto: UpdateLeaveDto,
        user: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: LeaveEntity }> {
        const { data: leave } = await this.findOne(id, lang);

        // 1. Vérifier que le statut est fourni
        if (!dto.status) {
            throw new BadRequestException(
                await this.i18nService.translate('leave.status_required', lang),
            );
        }

        // 2. Vérifier que le congé n'est pas déjà finalisé
        if (
            leave.status === LeaveStatus.APPROVED ||
            leave.status === LeaveStatus.REJECTED
        ) {
            throw new BadRequestException(
                await this.i18nService.translate('leave.cannot_modify_finalized', lang, {
                    current: leave.status,
                }),
            );
        }

        // 3. Appliquer le nouveau statut
        leave.status = dto.status;

        if (dto.status === LeaveStatus.APPROVED) {
            leave.approvedById = user.id;
            leave.approvedAt = new Date();
        } else if (dto.status === LeaveStatus.REJECTED) {
            if (!dto.rejectionReason || dto.rejectionReason.trim() === '') {
                throw new BadRequestException(
                    await this.i18nService.translate('leave.rejection_reason_required', lang),
                );
            }
            leave.rejectionReason = dto.rejectionReason.trim();
            leave.approvedById = user.id;
            leave.approvedAt = new Date();
        }

        const saved = await this.leaveRepo.save(leave);

        return {
            message: await this.i18nService.translate('leave.status_updated_success', lang, {
                status: saved.status,
            }),
            data: saved,
        };
    }

    // ============================================================
    // 🗑️ REMOVE
    // ============================================================
    async remove(
        id: string,
        user: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: { id: string } }> {
        const { data: leave } = await this.findOne(id, lang);

        await this.leaveRepo.remove(leave);

        return {
            message: await this.i18nService.translate('leave.deleted_success', lang, {
                id,
            }),
            data: { id },
        };
    }
}