import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { AgentPaymentEntity } from '../entities/agent-payment.entity';
import { EmployeeEntity } from '../../employees/entities/employee.entity';
import { CreateAgentPaymentDto } from '../dto/create-agent-payment.dto';
import { UpdateAgentPaymentDto } from '../dto/update-agent-payment.dto';
import { ListAgentPaymentQueryDto } from '../dto/list-agent-payment-query.dto';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentType } from '../enums/payment-type.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { I18nService } from 'src/libs/common/src';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { UserEntity } from 'src/users/entities/user.entity';

@Injectable()
export class AgentPaymentsService {
    constructor(
        @InjectRepository(AgentPaymentEntity)
        private readonly paymentRepo: Repository<AgentPaymentEntity>,
        @InjectRepository(EmployeeEntity)
        private readonly employeeRepo: Repository<EmployeeEntity>,
        private readonly i18n: I18nService,
    ) { }

    // ============================================================
    // 🔢 GÉNÉRATION AUTOMATIQUE DE LA RÉFÉRENCE
    // ============================================================
    private async generateReference(
        type: PaymentType,
        date: Date = new Date(),
    ): Promise<string> {
        const prefixes: Record<PaymentType, string> = {
            [PaymentType.SALARY]: 'SAL',
            [PaymentType.ADVANCE]: 'ADV',
            [PaymentType.REFUND]: 'REF',
            [PaymentType.BONUS]: 'BON',
            [PaymentType.PENALTY]: 'PEN',
        };

        const prefix = prefixes[type] ?? 'PAY';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const period = `${year}${month}`;

        const count = await this.paymentRepo
            .createQueryBuilder('payment')
            .where('payment.type = :type', { type })
            .andWhere('payment.reference LIKE :pattern', {
                pattern: `${prefix}-${period}-%`,
            })
            .getCount();

        const sequence = String(count + 1).padStart(4, '0');
        return `${prefix}-${period}-${sequence}`;
    }

    // ============================================================
    // 🔒 VALIDATION D'UN EMPLOYÉ (multi-tenant)
    // ============================================================
    private async validateEmployeeAccess(
        employeeId: string,
        currentUser: UserEntity,
        lang: string,
    ): Promise<EmployeeEntity> {
        const employee = await this.employeeRepo.findOne({
            where: { id: employeeId },
        });

        if (!employee) {
            throw new NotFoundException(
                await this.i18n.translate('hr.payment.employee_not_found', lang, { id: employeeId }),
            );
        }

        // 🔒 L'employé doit appartenir à la company du user connecté
        if (
            currentUser.activeCompanyId &&
            employee.companyId &&
            employee.companyId !== currentUser.activeCompanyId
        ) {
            throw new NotFoundException(
                await this.i18n.translate('hr.payment.employee_not_found', lang, { id: employeeId }),
            );
        }

        return employee;
    }

    // ============================================================
    // ➕ CRÉER UN PAIEMENT
    // ============================================================
    async create(
        dto: CreateAgentPaymentDto,
        currentUser: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: AgentPaymentEntity }> {
        // 1. Vérifier l'employé (avec contrôle multi-tenant)
        const employee = await this.validateEmployeeAccess(dto.employeeId, currentUser, lang);

        // 2. Calculer le net selon le type
        const bonus = Number(dto.bonus ?? 0);
        const deduction = Number(dto.deduction ?? 0);
        let advanceDeducted = 0;
        let relatedPaymentId: string | undefined = undefined;

        // ✅ Cas SALARY : déduire les avances
        if (dto.type === PaymentType.SALARY && dto.advancesToDeduct?.length) {
            for (const adv of dto.advancesToDeduct) {
                const advancePayment = await this.paymentRepo.findOne({
                    where: {
                        id: adv.advancePaymentId,
                        type: PaymentType.ADVANCE,
                    },
                });

                if (!advancePayment) {
                    throw new NotFoundException(
                        await this.i18n.translate('hr.payment.advance_not_found', lang, {
                            id: adv.advancePaymentId,
                        }),
                    );
                }

                if (advancePayment.employeeId !== dto.employeeId) {
                    throw new BadRequestException(
                        await this.i18n.translate('hr.payment.advance_wrong_employee', lang),
                    );
                }

                if (advancePayment.status !== PaymentStatus.PAID) {
                    throw new BadRequestException(
                        await this.i18n.translate('hr.payment.advance_not_paid', lang),
                    );
                }

                if (advancePayment.relatedPaymentId) {
                    throw new BadRequestException(
                        await this.i18n.translate('hr.payment.advance_already_deducted', lang),
                    );
                }

                if (Number(adv.amount) > Number(advancePayment.amount)) {
                    throw new BadRequestException(
                        await this.i18n.translate('hr.payment.advance_amount_exceeded', lang),
                    );
                }

                advanceDeducted += Number(adv.amount);
                relatedPaymentId = adv.advancePaymentId;
            }
        }

        // Calcul du net
        let netAmount = Number(dto.amount) + bonus - deduction - advanceDeducted;

        if (
            dto.type === PaymentType.ADVANCE ||
            dto.type === PaymentType.REFUND
        ) {
            netAmount = Number(dto.amount);
        }

        if (netAmount < 0) {
            throw new BadRequestException(
                await this.i18n.translate('hr.payment.net_amount_negative', lang),
            );
        }

        // 3. Créer
        const payment: AgentPaymentEntity = this.paymentRepo.create({
            employeeId: dto.employeeId,
            companyId: employee.companyId,
            branchId: employee.branchId,
            paidById: currentUser.id,
            type: dto.type,
            amount: dto.amount,
            bonus,
            deduction,
            advanceDeducted,
            netAmount,
            currency: dto.currency ?? employee.currency ?? 'CDF',
            period: dto.period,
            periodStart: dto.periodStart ? new Date(dto.periodStart) : undefined,
            periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : undefined,
            method: dto.method,
            status: dto.status ?? PaymentStatus.PENDING,
            paidAt: dto.status === PaymentStatus.PAID ? new Date() : undefined,
            reference: await this.generateReference(dto.type),
            description: dto.description,
            notes: dto.notes,
            relatedPaymentId,
        });

        const saved = await this.paymentRepo.save(payment);

        // ✅ Lier les avances dès la création
        if (dto.type === PaymentType.SALARY && dto.advancesToDeduct?.length) {
            for (const adv of dto.advancesToDeduct) {
                await this.paymentRepo.update(adv.advancePaymentId, {
                    relatedPaymentId: saved.id,
                });
            }
        }

        return {
            message: await this.i18n.translate('hr.payment.created_success', lang),
            data: saved,
        };
    }

    // ============================================================
    // ➕➕ CRÉER PLUSIEURS PAIEMENTS EN LOT (bulk)
    // ============================================================
    async createBulk(
        dtos: CreateAgentPaymentDto[],
        currentUser: UserEntity,
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: {
            created: AgentPaymentEntity[];
            errors: { index: number; employeeId?: string; error: string }[];
        };
    }> {
        if (!dtos?.length) {
            throw new BadRequestException(
                await this.i18n.translate('hr.payment.bulk_empty', lang),
            );
        }

        const created: AgentPaymentEntity[] = [];
        const errors: { index: number; employeeId?: string; error: string }[] = [];

        for (let i = 0; i < dtos.length; i++) {
            try {
                const result = await this.create(dtos[i], currentUser, lang);
                created.push(result.data);
            } catch (e: any) {
                errors.push({
                    index: i,
                    employeeId: dtos[i]?.employeeId,
                    error: e?.message ?? 'Unknown error',
                });
            }
        }

        return {
            message: await this.i18n.translate('hr.payment.bulk_created', lang, {
                created: created.length,
                failed: errors.length,
            }),
            data: { created, errors },
        };
    }

    // ============================================================
    // 📋 LISTER LES PAIEMENTS
    // ============================================================
    async findAll(
        query: ListAgentPaymentQueryDto,
        currentUser: UserEntity,
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<AgentPaymentEntity>;
    }> {
        const page = query.page && query.page > 0 ? query.page : 1;
        const limit = query.limit && query.limit > 0 ? query.limit : 10;
        const skip = (page - 1) * limit;

        const qb = this.paymentRepo
            .createQueryBuilder('payment')
            .leftJoinAndSelect('payment.employee', 'employee')
            .leftJoinAndSelect('payment.company', 'company')
            .leftJoinAndSelect('payment.branch', 'branch')
            .leftJoinAndSelect('payment.paidBy', 'paidBy')
            .leftJoinAndSelect('payment.relatedPayment', 'relatedPayment')
            .orderBy('payment.createdAt', 'DESC')
            .skip(skip)
            .take(limit);

        // 🔒 Multi-tenant : restreindre à la company du user
        if (currentUser.activeCompanyId) {
            qb.andWhere('payment.companyId = :companyId', {
                companyId: currentUser.activeCompanyId,
            });
        }

        if (query.employeeId) {
            qb.andWhere('payment.employeeId = :employeeId', { employeeId: query.employeeId });
        }
        if (query.companyId) {
            qb.andWhere('payment.companyId = :companyId', { companyId: query.companyId });
        }
        if (query.branchId) {
            qb.andWhere('payment.branchId = :branchId', { branchId: query.branchId });
        }
        if (query.type) {
            qb.andWhere('payment.type = :type', { type: query.type });
        }
        if (query.status) {
            qb.andWhere('payment.status = :status', { status: query.status });
        }
        if (query.method) {
            qb.andWhere('payment.method = :method', { method: query.method });
        }
        if (query.period) {
            qb.andWhere('payment.period = :period', { period: query.period });
        }
        if (query.startDate) {
            qb.andWhere('payment.createdAt >= :startDate', {
                startDate: new Date(query.startDate),
            });
        }
        if (query.endDate) {
            qb.andWhere('payment.createdAt <= :endDate', {
                endDate: new Date(query.endDate),
            });
        }
        if (query.search?.trim()) {
            const keyword = `%${query.search.trim()}%`;
            qb.andWhere(
                '(employee.fullName LIKE :keyword OR payment.reference LIKE :keyword OR payment.description LIKE :keyword)',
                { keyword },
            );
        }

        const [data, total] = await qb.getManyAndCount();

        return {
            message:
                data.length > 0
                    ? await this.i18n.translate('hr.payment.list_success', lang, {
                        count: data.length,
                    })
                    : await this.i18n.translate('hr.payment.list_empty', lang),
            data: new PaginatedResponseDto(data, total, page, limit),
        };
    }

    // ============================================================
    // 🔍 VOIR UN PAIEMENT
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: AgentPaymentEntity }> {
        const payment = await this.paymentRepo.findOne({
            where: { id },
            relations: ['employee', 'company', 'branch', 'paidBy', 'relatedPayment'],
        });
        if (!payment) {
            throw new NotFoundException(
                await this.i18n.translate('hr.payment.not_found', lang, { id }),
            );
        }
        return {
            message: await this.i18n.translate('hr.payment.found_success', lang),
            data: payment,
        };
    }

    // ============================================================
    // ✏️ MODIFIER UN PAIEMENT
    // ============================================================
    async update(
        id: string,
        dto: UpdateAgentPaymentDto,
        currentUser: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: AgentPaymentEntity }> {
        const payment = await this.paymentRepo.findOne({ where: { id } });
        if (!payment) {
            throw new NotFoundException(
                await this.i18n.translate('hr.payment.not_found', lang, { id }),
            );
        }

        // 🔒 Interdire la modification d'un paiement déjà PAID (sauf notes)
        if (payment.status === PaymentStatus.PAID) {
            const onlyNotes =
                dto.notes !== undefined &&
                Object.keys(dto).every((k) => k === 'notes');
            if (!onlyNotes) {
                throw new BadRequestException(
                    await this.i18n.translate('hr.payment.cannot_update_paid', lang),
                );
            }
        }

        const amount =
            dto.amount !== undefined ? Number(dto.amount) : Number(payment.amount);
        const bonus =
            dto.bonus !== undefined ? Number(dto.bonus) : Number(payment.bonus);
        const deduction =
            dto.deduction !== undefined
                ? Number(dto.deduction)
                : Number(payment.deduction);
        const advanceDeducted = Number(payment.advanceDeducted);
        const netAmount = amount + bonus - deduction - advanceDeducted;

        if (netAmount < 0) {
            throw new BadRequestException(
                await this.i18n.translate('hr.payment.net_amount_negative', lang),
            );
        }

        Object.assign(payment, {
            ...(dto.amount !== undefined && { amount }),
            ...(dto.bonus !== undefined && { bonus }),
            ...(dto.deduction !== undefined && { deduction }),
            netAmount,
            ...(dto.currency !== undefined && { currency: dto.currency }),
            ...(dto.period !== undefined && { period: dto.period }),
            ...(dto.periodStart !== undefined && {
                periodStart: new Date(dto.periodStart),
            }),
            ...(dto.periodEnd !== undefined && { periodEnd: new Date(dto.periodEnd) }),
            ...(dto.method !== undefined && { method: dto.method }),
            ...(dto.status !== undefined && { status: dto.status }),
            ...(dto.reference !== undefined && { reference: dto.reference }),
            ...(dto.description !== undefined && { description: dto.description }),
            ...(dto.notes !== undefined && { notes: dto.notes }),
            ...(dto.companyId !== undefined && { companyId: dto.companyId }),
            ...(dto.branchId !== undefined && { branchId: dto.branchId }),
            updatedAt: new Date(),
        });

        if (
            dto.status === PaymentStatus.PAID &&
            payment.status !== PaymentStatus.PAID
        ) {
            payment.paidAt = new Date();
            payment.paidById = currentUser.id;
        }

        const updated = await this.paymentRepo.save(payment);

        return {
            message: await this.i18n.translate('hr.payment.updated_success', lang),
            data: updated,
        };
    }

    // ============================================================
    // ✅ MARQUER COMME PAYÉ
    // ============================================================
    async markAsPaid(
        id: string,
        currentUser: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: AgentPaymentEntity }> {
        const payment = await this.paymentRepo.findOne({
            where: { id },
            relations: ['relatedPayment'],
        });
        if (!payment) {
            throw new NotFoundException(
                await this.i18n.translate('hr.payment.not_found', lang, { id }),
            );
        }

        if (payment.status === PaymentStatus.PAID) {
            throw new BadRequestException(
                await this.i18n.translate('hr.payment.already_paid', lang),
            );
        }

        payment.status = PaymentStatus.PAID;
        payment.paidAt = new Date();
        payment.paidById = currentUser.id;

        const updated = await this.paymentRepo.save(payment);

        return {
            message: await this.i18n.translate('hr.payment.paid_success', lang),
            data: updated,
        };
    }

    // ============================================================
    // ✅✅ MARQUER PLUSIEURS PAIEMENTS COMME PAYÉS (bulk)
    // ============================================================
    async markManyAsPaid(
        ids: string[],
        currentUser: UserEntity,
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: { updated: number; skipped: string[] };
    }> {
        if (!ids?.length) {
            throw new BadRequestException(
                await this.i18n.translate('hr.payment.ids_required', lang),
            );
        }

        const payments = await this.paymentRepo.find({
            where: { id: In(ids) },
        });

        const updated: string[] = [];
        const skipped: string[] = [];

        for (const payment of payments) {
            if (payment.status === PaymentStatus.PAID) {
                skipped.push(payment.id);
                continue;
            }
            payment.status = PaymentStatus.PAID;
            payment.paidAt = new Date();
            payment.paidById = currentUser.id;
            await this.paymentRepo.save(payment);
            updated.push(payment.id);
        }

        return {
            message: await this.i18n.translate('hr.payment.bulk_paid', lang, {
                updated: updated.length,
                skipped: skipped.length,
            }),
            data: { updated: updated.length, skipped },
        };
    }

    // ============================================================
    // ↩️ ANNULER UN PAIEMENT (retour PENDING)
    // ============================================================
    async cancel(
        id: string,
        currentUser: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: AgentPaymentEntity }> {
        const payment = await this.paymentRepo.findOne({ where: { id } });
        if (!payment) {
            throw new NotFoundException(
                await this.i18n.translate('hr.payment.not_found', lang, { id }),
            );
        }

        if (payment.status === PaymentStatus.CANCELLED) {
            throw new BadRequestException(
                await this.i18n.translate('hr.payment.already_cancelled', lang),
            );
        }

        payment.status = PaymentStatus.CANCELLED;
        payment.paidAt = null as any;
        payment.paidById = null as any;

        const updated = await this.paymentRepo.save(payment);

        return {
            message: await this.i18n.translate('hr.payment.cancelled_success', lang),
            data: updated,
        };
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN PAIEMENT
    // ============================================================
    async remove(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string }> {
        const payment = await this.paymentRepo.findOne({ where: { id } });
        if (!payment) {
            throw new NotFoundException(
                await this.i18n.translate('hr.payment.not_found', lang, { id }),
            );
        }

        // 🔒 Interdire la suppression d'un paiement PAID
        if (payment.status === PaymentStatus.PAID) {
            throw new BadRequestException(
                await this.i18n.translate('hr.payment.cannot_delete_paid', lang),
            );
        }

        // Détacher les avances liées
        await this.paymentRepo
            .createQueryBuilder()
            .update(AgentPaymentEntity)
            .set({ relatedPaymentId: null as any })
            .where('relatedPaymentId = :id', { id })
            .execute();

        await this.paymentRepo.remove(payment);
        return {
            message: await this.i18n.translate('hr.payment.deleted_success', lang),
        };
    }

    // ============================================================
    // 📊 STATISTIQUES PAR EMPLOYÉ
    // ============================================================
    async getStatsByEmployee(
        employeeId: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: any }> {
        const employee = await this.employeeRepo.findOne({
            where: { id: employeeId },
        });
        if (!employee) {
            throw new NotFoundException(
                await this.i18n.translate('hr.payment.employee_not_found', lang),
            );
        }

        const payments = await this.paymentRepo.find({
            where: { employeeId },
            relations: ['relatedPayment'],
            order: { createdAt: 'DESC' },
        });

        const salaryPayments = payments.filter((p) => p.type === PaymentType.SALARY);
        const advancePayments = payments.filter((p) => p.type === PaymentType.ADVANCE);
        const refundPayments = payments.filter((p) => p.type === PaymentType.REFUND);
        const bonusPayments = payments.filter((p) => p.type === PaymentType.BONUS);
        const penaltyPayments = payments.filter((p) => p.type === PaymentType.PENALTY);

        const totalPaid = salaryPayments
            .filter((p) => p.status === PaymentStatus.PAID)
            .reduce((sum, p) => sum + Number(p.netAmount), 0);

        const totalPending = salaryPayments
            .filter((p) => p.status === PaymentStatus.PENDING)
            .reduce((sum, p) => sum + Number(p.netAmount), 0);

        const pendingAdvances = advancePayments
            .filter((p) => p.status === PaymentStatus.PAID && !p.relatedPaymentId)
            .reduce((sum, p) => sum + Number(p.amount), 0);

        const totalAdvances = advancePayments
            .filter((p) => p.status === PaymentStatus.PAID)
            .reduce((sum, p) => sum + Number(p.amount), 0);

        const totalRefundedAdvances = advancePayments
            .filter((p) => p.relatedPaymentId)
            .reduce((sum, p) => sum + Number(p.amount), 0);

        const totalBonuses = bonusPayments
            .filter((p) => p.status === PaymentStatus.PAID)
            .reduce((sum, p) => sum + Number(p.amount), 0);

        const totalPenalties = penaltyPayments
            .filter((p) => p.status === PaymentStatus.PAID)
            .reduce((sum, p) => sum + Number(p.amount), 0);

        return {
            message: await this.i18n.translate('hr.payment.stats_success', lang),
            data: {
                employeeId,
                employeeName: employee.fullName,
                baseSalary: Number(employee.baseSalary ?? 0),
                currency: employee.currency ?? 'CDF',
                salary: {
                    totalPayments: salaryPayments.length,
                    totalPaid,
                    totalPending,
                    lastPayment: salaryPayments[0] ?? null,
                },
                advances: {
                    totalAdvances,
                    pendingAdvances,
                    totalRefundedAdvances,
                    count: advancePayments.length,
                },
                refunds: {
                    count: refundPayments.length,
                    total: refundPayments.reduce((s, p) => s + Number(p.amount), 0),
                },
                bonuses: {
                    count: bonusPayments.length,
                    total: totalBonuses,
                },
                penalties: {
                    count: penaltyPayments.length,
                    total: totalPenalties,
                },
                payments,
            },
        };
    }

    // ============================================================
    // 📊 STATISTIQUES GLOBALES (company)
    // ============================================================
    async getGlobalStats(
        currentUser: UserEntity,
        filters: {
            period?: string;
            branchId?: string;
            startDate?: string;
            endDate?: string;
        } = {},
        lang: string = 'fr',
    ): Promise<{ message: string; data: any }> {
        const qb = this.paymentRepo
            .createQueryBuilder('payment')
            .leftJoin('payment.employee', 'employee');

        if (currentUser.activeCompanyId) {
            qb.andWhere('payment.companyId = :companyId', {
                companyId: currentUser.activeCompanyId,
            });
        }
        if (filters.branchId) {
            qb.andWhere('payment.branchId = :branchId', { branchId: filters.branchId });
        }
        if (filters.period) {
            qb.andWhere('payment.period = :period', { period: filters.period });
        }
        if (filters.startDate) {
            qb.andWhere('payment.createdAt >= :startDate', {
                startDate: new Date(filters.startDate),
            });
        }
        if (filters.endDate) {
            qb.andWhere('payment.createdAt <= :endDate', {
                endDate: new Date(filters.endDate),
            });
        }

        // Totaux par type et statut
        const raw = await qb
            .select('payment.type', 'type')
            .addSelect('payment.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .addSelect('SUM(payment.amount)', 'totalAmount')
            .addSelect('SUM(payment.netAmount)', 'totalNet')
            .addSelect('SUM(payment.advanceDeducted)', 'totalAdvances')
            .groupBy('payment.type')
            .addGroupBy('payment.status')
            .getRawMany();

        // Regrouper par type
        const byType: Record<string, any> = {};
        let grandTotalNet = 0;
        let grandTotalCount = 0;

        for (const row of raw) {
            if (!byType[row.type]) {
                byType[row.type] = {
                    type: row.type,
                    count: 0,
                    totalAmount: 0,
                    totalNet: 0,
                    totalAdvances: 0,
                    byStatus: {},
                };
            }
            const t = byType[row.type];
            t.count += Number(row.count);
            t.totalAmount += Number(row.totalAmount ?? 0);
            t.totalNet += Number(row.totalNet ?? 0);
            t.totalAdvances += Number(row.totalAdvances ?? 0);
            t.byStatus[row.status] = {
                count: Number(row.count),
                totalNet: Number(row.totalNet ?? 0),
            };

            grandTotalNet += Number(row.totalNet ?? 0);
            grandTotalCount += Number(row.count);
        }

        // Nombre d'employés distincts payés
        const distinctEmployees = await qb
            .clone()
            .select('COUNT(DISTINCT payment.employeeId)', 'count')
            .getRawOne();

        return {
            message: await this.i18n.translate('hr.payment.global_stats_success', lang),
            data: {
                filters,
                employeeCount: Number(distinctEmployees?.count ?? 0),
                paymentCount: grandTotalCount,
                totalNet: grandTotalNet,
                byType: Object.values(byType),
            },
        };
    }

    // ============================================================
    // 📋 LISTER LES AVANCES D'UN EMPLOYÉ
    // ============================================================
    async getEmployeeAdvances(
        employeeId: string,
        onlyPending: boolean = false,
        lang: string = 'fr',
    ): Promise<{ message: string; data: AgentPaymentEntity[] }> {
        const qb = this.paymentRepo
            .createQueryBuilder('payment')
            .where('payment.employeeId = :employeeId', { employeeId })
            .andWhere('payment.type = :type', { type: PaymentType.ADVANCE })
            .orderBy('payment.createdAt', 'DESC');

        if (onlyPending) {
            qb.andWhere('payment.status = :paid', { paid: PaymentStatus.PAID });
            qb.andWhere('payment.relatedPaymentId IS NULL');
        }

        const data = await qb.getMany();

        return {
            message: await this.i18n.translate('hr.payment.advances_list', lang, {
                count: data.length,
            }),
            data,
        };
    }

    // ============================================================
    // 💰 TOTAL DES AVANCES EN COURS (pour déduction auto)
    // ============================================================
    async getPendingAdvancesTotal(
        employeeId: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: { total: number; count: number } }> {
        const result = await this.paymentRepo
            .createQueryBuilder('payment')
            .select('COALESCE(SUM(payment.amount), 0)', 'total')
            .addSelect('COUNT(*)', 'count')
            .where('payment.employeeId = :employeeId', { employeeId })
            .andWhere('payment.type = :type', { type: PaymentType.ADVANCE })
            .andWhere('payment.status = :paid', { paid: PaymentStatus.PAID })
            .andWhere('payment.relatedPaymentId IS NULL')
            .getRawOne();

        return {
            message: await this.i18n.translate('hr.payment.pending_advances_total', lang),
            data: {
                total: Number(result?.total ?? 0),
                count: Number(result?.count ?? 0),
            },
        };
    }

    // ============================================================
    // 📅 HISTORIQUE MENSUEL D'UN EMPLOYÉ
    // ============================================================
    async getMonthlyHistory(
        employeeId: string,
        months: number = 12,
        lang: string = 'fr',
    ): Promise<{ message: string; data: any[] }> {
        const since = new Date();
        since.setMonth(since.getMonth() - months);

        const payments = await this.paymentRepo.find({
            where: {
                employeeId,
                createdAt: Between(since, new Date()),
            },
            order: { createdAt: 'ASC' },
        });

        // Regrouper par mois
        const byMonth: Record<string, any> = {};

        for (const p of payments) {
            const key = p.period ?? `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, '0')}`;
            if (!byMonth[key]) {
                byMonth[key] = {
                    period: key,
                    salary: 0,
                    bonuses: 0,
                    penalties: 0,
                    advances: 0,
                    netPaid: 0,
                };
            }
            const m = byMonth[key];
            const amount = Number(p.amount);
            const net = Number(p.netAmount);

            switch (p.type) {
                case PaymentType.SALARY:
                    m.salary += amount;
                    if (p.status === PaymentStatus.PAID) m.netPaid += net;
                    break;
                case PaymentType.BONUS:
                    m.bonuses += amount;
                    break;
                case PaymentType.PENALTY:
                    m.penalties += amount;
                    break;
                case PaymentType.ADVANCE:
                    m.advances += amount;
                    break;
            }
        }

        return {
            message: await this.i18n.translate('hr.payment.monthly_history', lang, {
                count: Object.keys(byMonth).length,
            }),
            data: Object.values(byMonth),
        };
    }

    // ============================================================
    // 📊 RÉSUMÉ DE PAIE PAR PÉRIODE (pour validation en masse)
    // ============================================================
    async getPayrollSummary(
        period: string,
        currentUser: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: any }> {
        const qb = this.paymentRepo
            .createQueryBuilder('payment')
            .leftJoinAndSelect('payment.employee', 'employee')
            .where('payment.period = :period', { period })
            .andWhere('payment.type = :type', { type: PaymentType.SALARY });

        if (currentUser.activeCompanyId) {
            qb.andWhere('payment.companyId = :companyId', {
                companyId: currentUser.activeCompanyId,
            });
        }

        const salaries = await qb.getMany();

        const totalGross = salaries.reduce(
            (s, p) => s + Number(p.amount) + Number(p.bonus),
            0,
        );
        const totalDeductions = salaries.reduce(
            (s, p) => s + Number(p.deduction) + Number(p.advanceDeducted),
            0,
        );
        const totalNet = salaries.reduce((s, p) => s + Number(p.netAmount), 0);

        const byStatus = {
            pending: salaries.filter((p) => p.status === PaymentStatus.PENDING).length,
            paid: salaries.filter((p) => p.status === PaymentStatus.PAID).length,
            cancelled: salaries.filter((p) => p.status === PaymentStatus.CANCELLED).length,
        };

        return {
            message: await this.i18n.translate('hr.payment.payroll_summary', lang, {
                period,
            }),
            data: {
                period,
                employeeCount: new Set(salaries.map((p) => p.employeeId)).size,
                paymentCount: salaries.length,
                totalGross,
                totalDeductions,
                totalNet,
                byStatus,
                salaries,
            },
        };
    }
}