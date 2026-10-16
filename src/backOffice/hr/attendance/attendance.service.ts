import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AttendanceEntity } from './entities/attendance.entity';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { AttendanceStatus } from '../common/enums/attendance-status.enum';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { I18nService } from 'src/libs/common/src';

@Injectable()
export class AttendanceService {
    constructor(
        @InjectRepository(AttendanceEntity)
        private readonly attendanceRepo: Repository<AttendanceEntity>,

        @InjectRepository(EmployeeEntity)
        private readonly employeeRepo: Repository<EmployeeEntity>,

        private readonly i18nService: I18nService,
    ) { }

    // ============================================================
    // 🔒 VÉRIFIER UN EMPLOYÉ
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
                await this.i18nService.translate('attendance.employee_not_found', lang, {
                    id: employeeId,
                }),
            );
        }

        return employee;
    }

    // ============================================================
    // ➕ CHECK-IN
    // ============================================================
    async checkIn(
        dto: CreateAttendanceDto,
        lang: string = 'fr',
    ): Promise<{ message: string; data: AttendanceEntity }> {
        // 1. Validations
        if (!dto.employeeId) {
            throw new BadRequestException(
                await this.i18nService.translate('attendance.employee_required', lang),
            );
        }

        if (!dto.date) {
            throw new BadRequestException(
                await this.i18nService.translate('attendance.date_required', lang),
            );
        }

        // 2. Vérifier l'employé
        await this.validateEmployee(dto.employeeId, lang);

        // 3. Normaliser la date (début de journée)
        const today = new Date(dto.date);
        today.setHours(0, 0, 0, 0);

        // 4. Rechercher un enregistrement existant
        let attendance = await this.attendanceRepo.findOne({
            where: { employeeId: dto.employeeId, date: today },
        });

        const now = new Date();
        const checkInAt = dto.checkInAt ? new Date(dto.checkInAt) : now;

        if (!attendance) {
            // 🔹 Créer un nouveau pointage
            attendance = this.attendanceRepo.create({
                employeeId: dto.employeeId,
                date: today,
                checkInAt,
                status: dto.status || AttendanceStatus.PRESENT,
                notes: dto.notes,
            });
        } else {
            // 🔹 Mettre à jour le check-in
            if (attendance.checkInAt) {
                throw new BadRequestException(
                    await this.i18nService.translate('attendance.already_checked_in', lang),
                );
            }

            attendance.checkInAt = checkInAt;
            if (dto.status) attendance.status = dto.status;
            if (dto.notes !== undefined) attendance.notes = dto.notes;
        }

        const saved = await this.attendanceRepo.save(attendance);

        return {
            message: await this.i18nService.translate('attendance.check_in_success', lang, {
                name: (await this.validateEmployee(dto.employeeId, lang)).fullName,
            }),
            data: saved,
        };
    }

    // ============================================================
    // ➖ CHECK-OUT
    // ============================================================
    async checkOut(
        employeeId: string,
        checkOutAt?: Date,
        lang: string = 'fr',
    ): Promise<{ message: string; data: AttendanceEntity }> {
        // 1. Vérifier l'employé
        await this.validateEmployee(employeeId, lang);

        // 2. Récupérer le pointage du jour
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const attendance = await this.attendanceRepo.findOne({
            where: { employeeId, date: today },
        });

        if (!attendance) {
            throw new NotFoundException(
                await this.i18nService.translate('attendance.no_check_in_today', lang),
            );
        }

        if (!attendance.checkInAt) {
            throw new BadRequestException(
                await this.i18nService.translate('attendance.missing_check_in', lang),
            );
        }

        if (attendance.checkOutAt) {
            throw new BadRequestException(
                await this.i18nService.translate('attendance.already_checked_out', lang),
            );
        }

        // 3. Appliquer le check-out
        attendance.checkOutAt = checkOutAt || new Date();

        // 4. Calculer les minutes travaillées
        const diff =
            (attendance.checkOutAt.getTime() - attendance.checkInAt.getTime()) / 60000;
        attendance.workedMinutes = Math.round(diff);

        const saved = await this.attendanceRepo.save(attendance);

        return {
            message: await this.i18nService.translate('attendance.check_out_success', lang, {
                minutes: attendance.workedMinutes,
            }),
            data: saved,
        };
    }

    // ============================================================
    // 📋 LISTER LES PRÉSENCES
    // ============================================================
    async findAll(
        filters: {
            employeeId?: string;
            startDate?: string;
            endDate?: string;
            status?: AttendanceStatus;
            page?: number;
            limit?: number;
        },
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<AttendanceEntity>;
    }> {
        const {
            employeeId,
            startDate,
            endDate,
            status,
            page = 1,
            limit = 10,
        } = filters;

        const qb = this.attendanceRepo
            .createQueryBuilder('a')
            .leftJoinAndSelect('a.employee', 'employee')
            .orderBy('a.date', 'DESC');

        if (employeeId?.trim()) {
            qb.andWhere('a.employeeId = :employeeId', { employeeId: employeeId.trim() });
        }

        if (startDate && endDate) {
            qb.andWhere('a.date BETWEEN :startDate AND :endDate', {
                startDate: new Date(startDate),
                endDate: new Date(endDate),
            });
        }

        if (status) {
            qb.andWhere('a.status = :status', { status });
        }

        // Pagination
        const currentPage = Math.max(1, Number(page) || 1);
        const currentLimit = Math.max(1, Number(limit) || 10);
        const skip = (currentPage - 1) * currentLimit;

        qb.skip(skip).take(currentLimit);

        const [attendances, total] = await qb.getManyAndCount();

        if (!attendances.length) {
            throw new NotFoundException(
                await this.i18nService.translate('attendance.not_found', lang),
            );
        }

        return {
            message: await this.i18nService.translate('attendance.list_retrieved', lang),
            data: new PaginatedResponseDto(attendances, total, currentPage, currentLimit),
        };
    }

    // ============================================================
    // 🔍 VOIR UN POINTAGE
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: AttendanceEntity }> {
        const attendance = await this.attendanceRepo.findOne({
            where: { id },
            relations: ['employee'],
        });

        if (!attendance) {
            throw new NotFoundException(
                await this.i18nService.translate('attendance.not_found_by_id', lang, { id }),
            );
        }

        return {
            message: await this.i18nService.translate('attendance.found_success', lang),
            data: attendance,
        };
    }

    // ============================================================
    // 📊 STATS D'UN EMPLOYÉ SUR UNE PÉRIODE
    // ============================================================
    async getEmployeeStats(
        employeeId: string,
        startDate: Date,
        endDate: Date,
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: {
            totalDays: number;
            presentDays: number;
            absentDays: number;
            lateDays: number;
            halfDays: number;
            onLeaveDays: number;
            totalWorkedMinutes: number;
            totalWorkedHours: number;
        };
    }> {
        await this.validateEmployee(employeeId, lang);

        const adjustedEndDate = new Date(endDate);
        adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);

        const attendances = await this.attendanceRepo.find({
            where: {
                employeeId,
                date: Between(startDate, adjustedEndDate),
            },
        });

        const totalDays = attendances.length;
        const presentDays = attendances.filter((a) => a.status === AttendanceStatus.PRESENT).length;
        const absentDays = attendances.filter((a) => a.status === AttendanceStatus.ABSENT).length;
        const lateDays = attendances.filter((a) => a.status === AttendanceStatus.LATE).length;
        const halfDays = attendances.filter((a) => a.status === AttendanceStatus.HALF_DAY).length;
        const onLeaveDays = attendances.filter((a) => a.status === AttendanceStatus.ON_LEAVE).length;

        const totalWorkedMinutes = attendances.reduce(
            (sum, a) => sum + (a.workedMinutes || 0),
            0,
        );

        return {
            message: await this.i18nService.translate('attendance.stats_retrieved', lang),
            data: {
                totalDays,
                presentDays,
                absentDays,
                lateDays,
                halfDays,
                onLeaveDays,
                totalWorkedMinutes,
                totalWorkedHours: Number((totalWorkedMinutes / 60).toFixed(2)),
            },
        };
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN POINTAGE
    // ============================================================
    async remove(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string }> {
        const { data: attendance } = await this.findOne(id, lang);
        await this.attendanceRepo.remove(attendance);

        return {
            message: await this.i18nService.translate('attendance.deleted_success', lang),
        };
    }
}