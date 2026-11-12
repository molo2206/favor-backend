import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayslipEntity } from '../entities/payslip.entity';
import { PayslipLineEntity } from '../entities/payslip-line.entity';
import { PayslipLineType } from '../enums/payslip-line-type.enum';
import { PayslipStatus } from '../enums/payslip-status.enum';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';

@Injectable()
export class PayslipService {
    constructor(
        @InjectRepository(PayslipEntity)
        private readonly payslipRepo: Repository<PayslipEntity>,
        @InjectRepository(PayslipLineEntity)
        private readonly lineRepo: Repository<PayslipLineEntity>,
        private readonly i18n: I18nService,
    ) { }

    // ============================================================
    // 🔍 VOIR UNE FICHE DE PAIE
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: PayslipEntity }> {
        const payslip = await this.payslipRepo.findOne({
            where: { id },
            relations: [
                'employee',
                'employee.department',
                'employee.branch',
                'payrollRun',
                'lines',
                'payment',
            ],
        });

        if (!payslip) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.payslip_not_found', lang, { id }),
            );
        }

        // Trier les lignes par code pour un affichage cohérent
        if (payslip.lines) {
            payslip.lines.sort((a, b) => {
                if (a.type !== b.type) return a.type === PayslipLineType.EARNING ? -1 : 1;
                return a.code.localeCompare(b.code);
            });
        }

        return {
            message: await this.i18n.translate('payroll.payslip_found', lang),
            data: payslip,
        };
    }

    // ============================================================
    // 📋 LISTER LES FICHES D'UN CYCLE
    // ============================================================
    async listByRun(
        payrollRunId: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: PayslipEntity[] }> {
        const payslips = await this.payslipRepo.find({
            where: { payrollRunId },
            relations: ['employee', 'employee.department', 'lines'],
            order: { createdAt: 'ASC' },
        });

        return {
            message: await this.i18n.translate('payroll.payslips_list', lang, {
                count: payslips.length,
            }),
            data: payslips,
        };
    }

    // ============================================================
    // 📋 LISTER LES FICHES D'UN EMPLOYÉ
    // ============================================================
    async listByEmployee(
        employeeId: string,
        filters: { period?: string; page?: number; limit?: number } = {},
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: {
            items: PayslipEntity[];
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }> {
        const page = Math.max(1, Number(filters.page) || 1);
        const limit = Math.min(Math.max(1, Number(filters.limit) || 20), 100);
        const skip = (page - 1) * limit;

        const qb = this.payslipRepo
            .createQueryBuilder('payslip')
            .leftJoinAndSelect('payslip.employee', 'employee')
            .leftJoinAndSelect('payslip.payrollRun', 'payrollRun')
            .leftJoinAndSelect('payslip.lines', 'lines')
            .where('payslip.employeeId = :employeeId', { employeeId })
            .orderBy('payslip.createdAt', 'DESC')
            .skip(skip)
            .take(limit);

        if (filters.period) {
            qb.andWhere('payslip.period = :period', { period: filters.period });
        }

        const [items, total] = await qb.getManyAndCount();

        return {
            message: await this.i18n.translate('payroll.payslips_list', lang, {
                count: items.length,
            }),
            data: {
                items,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    // ============================================================
    // ✏️ MODIFIER UNE LIGNE
    // ============================================================
    async updateLine(
        payslipId: string,
        lineId: string,
        dto: { amount?: number; notes?: string },
        currentUser: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: PayslipEntity }> {
        const payslip = await this.payslipRepo.findOne({
            where: { id: payslipId },
            relations: ['lines'],
        });

        if (!payslip) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.payslip_not_found', lang, {
                    id: payslipId,
                }),
            );
        }

        if (payslip.status !== PayslipStatus.DRAFT) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.payslip_locked', lang, {
                    status: payslip.status,
                }),
            );
        }

        const line = payslip.lines?.find((l) => l.id === lineId);
        if (!line) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.payslip_line_not_found', lang, {
                    id: lineId,
                }),
            );
        }

        if (dto.amount !== undefined) {
            // Conserver le signe : DEDUCTION reste négatif, EARNING positif
            const sign = line.type === PayslipLineType.DEDUCTION ? -1 : 1;
            line.amount = sign * Math.abs(Number(dto.amount));
        }
        if (dto.notes !== undefined) {
            line.notes = dto.notes;
        }

        await this.lineRepo.save(line);
        await this.recalculate(payslipId);

        return this.findOne(payslipId, lang);
    }

    // ============================================================
    // ➕ AJOUTER UNE LIGNE MANUELLE
    // ============================================================
    async addLine(
        payslipId: string,
        dto: {
            type: PayslipLineType;
            code: string;
            label: string;
            amount: number;
            notes?: string;
        },
        currentUser: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: PayslipEntity }> {
        const payslip = await this.payslipRepo.findOne({
            where: { id: payslipId },
        });

        if (!payslip) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.payslip_not_found', lang, {
                    id: payslipId,
                }),
            );
        }

        if (payslip.status !== PayslipStatus.DRAFT) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.payslip_locked', lang, {
                    status: payslip.status,
                }),
            );
        }

        // Vérifier qu'une ligne avec le même code n'existe pas déjà
        const existing = await this.lineRepo.findOne({
            where: { payslipId, code: dto.code },
        });

        if (existing) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.payslip_line_code_exists', lang, {
                    code: dto.code,
                }),
            );
        }

        const sign = dto.type === PayslipLineType.DEDUCTION ? -1 : 1;
        const line = this.lineRepo.create({
            payslipId,
            type: dto.type,
            code: dto.code,
            label: dto.label,
            amount: sign * Math.abs(Number(dto.amount)),
            notes: dto.notes,
        });

        await this.lineRepo.save(line);
        await this.recalculate(payslipId);

        return this.findOne(payslipId, lang);
    }

    // ============================================================
    // 🗑️ SUPPRIMER UNE LIGNE
    // ============================================================
    async removeLine(
        payslipId: string,
        lineId: string,
        currentUser: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: PayslipEntity }> {
        const payslip = await this.payslipRepo.findOne({
            where: { id: payslipId },
            relations: ['lines'],
        });

        if (!payslip) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.payslip_not_found', lang, {
                    id: payslipId,
                }),
            );
        }

        if (payslip.status !== PayslipStatus.DRAFT) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.payslip_locked', lang, {
                    status: payslip.status,
                }),
            );
        }

        const line = payslip.lines?.find((l) => l.id === lineId);
        if (!line) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.payslip_line_not_found', lang, {
                    id: lineId,
                }),
            );
        }

        // Empêcher la suppression de la ligne BASE
        if (line.code === 'BASE') {
            throw new BadRequestException(
                await this.i18n.translate('payroll.payslip_base_not_deletable', lang),
            );
        }

        await this.lineRepo.remove(line);
        await this.recalculate(payslipId);

        return this.findOne(payslipId, lang);
    }

    // ============================================================
    // 🔄 RECALCULER LES TOTAUX D'UNE FICHE
    // ============================================================
    async recalculate(payslipId: string): Promise<void> {
        const payslip = await this.payslipRepo.findOne({
            where: { id: payslipId },
            relations: ['lines'],
        });

        if (!payslip) return;

        const baseSalary = Number(payslip.baseSalary ?? 0);

        const earnings = (payslip.lines ?? [])
            .filter((l) => l.type === PayslipLineType.EARNING)
            .reduce((s, l) => s + Number(l.amount), 0);

        const deductions = (payslip.lines ?? [])
            .filter((l) => l.type === PayslipLineType.DEDUCTION)
            .reduce((s, l) => s + Math.abs(Number(l.amount)), 0);

        const advancesTotal = (payslip.lines ?? [])
            .filter((l) => l.code === 'AVANCE')
            .reduce((s, l) => s + Math.abs(Number(l.amount)), 0);

        payslip.totalEarnings = earnings - baseSalary;
        payslip.totalDeductions = deductions;
        payslip.grossSalary = earnings;
        payslip.netSalary = earnings - deductions;
        payslip.advancesDeducted = advancesTotal;

        await this.payslipRepo.save(payslip);
    }

    // ============================================================
    // ✅ VALIDER UNE FICHE (passage DRAFT → VALIDATED)
    // ============================================================
    async validate(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: PayslipEntity }> {
        const payslip = await this.payslipRepo.findOne({ where: { id } });

        if (!payslip) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.payslip_not_found', lang, { id }),
            );
        }

        if (payslip.status !== PayslipStatus.DRAFT) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.payslip_not_draft', lang, {
                    status: payslip.status,
                }),
            );
        }

        if (Number(payslip.netSalary) < 0) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.payslip_negative_net', lang),
            );
        }

        payslip.status = PayslipStatus.VALIDATED;
        const saved = await this.payslipRepo.save(payslip);

        return {
            message: await this.i18n.translate('payroll.payslip_validated', lang),
            data: saved,
        };
    }

    // ============================================================
    // ↩️ REPASSER EN DRAFT (annuler la validation)
    // ============================================================
    async revertToDraft(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: PayslipEntity }> {
        const payslip = await this.payslipRepo.findOne({ where: { id } });

        if (!payslip) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.payslip_not_found', lang, { id }),
            );
        }

        if (payslip.status === PayslipStatus.PAID) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.payslip_cannot_revert_paid', lang),
            );
        }

        payslip.status = PayslipStatus.DRAFT;
        const saved = await this.payslipRepo.save(payslip);

        return {
            message: await this.i18n.translate('payroll.payslip_reverted', lang),
            data: saved,
        };
    }

    // ============================================================
    // 📊 DÉTAIL DÉTAILLÉ D'UNE FICHE (pour PDF / impression)
    // ============================================================
    async getDetailedPayslip(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: any }> {
        const payslip = await this.payslipRepo.findOne({
            where: { id },
            relations: [
                'employee',
                'employee.department',
                'employee.branch',
                'employee.company',
                'payrollRun',
                'lines',
                'payment',
            ],
        });

        if (!payslip) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.payslip_not_found', lang, { id }),
            );
        }

        const earnings = (payslip.lines ?? [])
            .filter((l) => l.type === PayslipLineType.EARNING)
            .sort((a, b) => a.code.localeCompare(b.code));

        const deductions = (payslip.lines ?? [])
            .filter((l) => l.type === PayslipLineType.DEDUCTION)
            .sort((a, b) => a.code.localeCompare(b.code));

        return {
            message: await this.i18n.translate('payroll.payslip_found', lang),
            data: {
                // En-tête
                reference: payslip.reference,
                period: payslip.period,
                periodStart: payslip.periodStart,
                periodEnd: payslip.periodEnd,
                currency: payslip.currency,

                // Employé
                employee: {
                    id: payslip.employee?.id,
                    fullName: payslip.employee?.fullName,
                    position: payslip.employee?.position,
                    department: payslip.employee?.department?.name,
                    branch: payslip.employee?.branch?.name,
                },

                // Entreprise
                company: {
                    id: (payslip.employee as any)?.company?.id,
                    name: (payslip.employee as any)?.company?.name,
                },

                // Détails des gains
                earnings: earnings.map((l) => ({
                    code: l.code,
                    label: l.label,
                    amount: Number(l.amount),
                    rate: l.rate,
                })),

                // Détails des retenues
                deductions: deductions.map((l) => ({
                    code: l.code,
                    label: l.label,
                    amount: Math.abs(Number(l.amount)),
                    rate: l.rate,
                })),

                // Totaux
                totals: {
                    baseSalary: Number(payslip.baseSalary),
                    totalEarnings: Number(payslip.totalEarnings),
                    grossSalary: Number(payslip.grossSalary),
                    totalDeductions: Number(payslip.totalDeductions),
                    advancesDeducted: Number(payslip.advancesDeducted),
                    netSalary: Number(payslip.netSalary),
                },

                // Statut
                status: payslip.status,
                paidAt: payslip.paidAt,
                paymentReference: payslip.payment?.reference,
            },
        };
    }

    // ============================================================
    // 📊 STATISTIQUES D'UN CYCLE
    // ============================================================
    async getRunStats(
        payrollRunId: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: any }> {
        const payslips = await this.payslipRepo.find({
            where: { payrollRunId },
            relations: ['lines'],
        });

        const totalGross = payslips.reduce(
            (s, p) => s + Number(p.grossSalary),
            0,
        );
        const totalDeductions = payslips.reduce(
            (s, p) => s + Number(p.totalDeductions),
            0,
        );
        const totalNet = payslips.reduce((s, p) => s + Number(p.netSalary), 0);
        const totalAdvances = payslips.reduce(
            (s, p) => s + Number(p.advancesDeducted),
            0,
        );

        const byStatus = {
            draft: payslips.filter((p) => p.status === PayslipStatus.DRAFT).length,
            validated: payslips.filter((p) => p.status === PayslipStatus.VALIDATED).length,
            paid: payslips.filter((p) => p.status === PayslipStatus.PAID).length,
            cancelled: payslips.filter((p) => p.status === PayslipStatus.CANCELLED).length,
        };

        // Répartition par code de ligne (agrégats)
        const byLineCode: Record<string, { code: string; label: string; type: string; total: number; count: number }> = {};

        for (const payslip of payslips) {
            for (const line of payslip.lines ?? []) {
                if (!byLineCode[line.code]) {
                    byLineCode[line.code] = {
                        code: line.code,
                        label: line.label,
                        type: line.type,
                        total: 0,
                        count: 0,
                    };
                }
                byLineCode[line.code].total += Math.abs(Number(line.amount));
                byLineCode[line.code].count += 1;
            }
        }

        return {
            message: await this.i18n.translate('payroll.payslip_run_stats', lang),
            data: {
                payrollRunId,
                employeeCount: payslips.length,
                totalGross,
                totalDeductions,
                totalAdvances,
                totalNet,
                byStatus,
                byLineCode: Object.values(byLineCode),
            },
        };
    }
}