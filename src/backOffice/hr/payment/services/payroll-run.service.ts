import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PayrollRunEntity } from '../entities/payroll-run.entity';
import { PayslipEntity } from '../entities/payslip.entity';
import { PayslipLineEntity } from '../entities/payslip-line.entity';
import { EmployeeEntity } from '../../employees/entities/employee.entity';
import { CreatePayrollRunDto } from '../dto/create-payroll-run.dto';
import { PayPayrollRunDto } from '../dto/pay-payroll-run.dto';
import { PayrollRunStatus } from '../enums/payroll-run-status.enum';
import { PayslipStatus } from '../enums/payslip-status.enum';
import { PayslipLineType } from '../enums/payslip-line-type.enum';
import { PayrollItemCalculation } from '../enums/payroll-item-calculation.enum';
import { AgentPaymentsService } from './agent-payments.service';
import { PaymentType } from '../enums/payment-type.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';

// ✅ SMS uniquement
import { SmsService } from 'src/users/utility/sms/sms.service';
import { SmsQuotaService } from 'src/users/utility/sms/sms-quota.service';
import { SmsCategory } from 'src/users/utility/sms/entity/sms-recharge.entity';
import { FpayService } from 'src/fpay/fpay.service';
import { PaymentMethod } from '../enums/payment-method.enum';

@Injectable()
export class PayrollRunService {
    private readonly logger = new Logger(PayrollRunService.name);

    constructor(
        @InjectRepository(PayrollRunEntity)
        private readonly runRepo: Repository<PayrollRunEntity>,
        @InjectRepository(PayslipEntity)
        private readonly payslipRepo: Repository<PayslipEntity>,
        @InjectRepository(PayslipLineEntity)
        private readonly lineRepo: Repository<PayslipLineEntity>,
        @InjectRepository(EmployeeEntity)
        private readonly employeeRepo: Repository<EmployeeEntity>,
        private readonly agentPaymentsService: AgentPaymentsService,
        private readonly dataSource: DataSource,
        private readonly i18n: I18nService,
        private readonly smsService: SmsService,
        private readonly smsQuotaService: SmsQuotaService,
        private readonly fpayService: FpayService,
    ) { }

    // ============================================================
    // 🔧 UTILITAIRES
    // ============================================================
    private toIsoString(
        value: Date | string | null | undefined,
    ): string | undefined {
        if (!value) return undefined;
        if (typeof value === 'string') return value;
        if (value instanceof Date) return value.toISOString();
        return undefined;
    }

    // ============================================================
    // 🔻 CONSOMMER 1 SMS DU QUOTA
    // ============================================================
    private async consumeSmsQuota(
        referenceId: string | undefined,
        referenceType: string,
        // ✅ Numéro du destinataire : le quota de SON pays est décompté
        phone?: string | null,
    ): Promise<boolean> {
        try {
            const result = await this.smsQuotaService.tryConsume(SmsCategory.SERVICE_CLIENT, 1, phone);

            if (!result.allowed) {
                this.logger.warn(
                    `[Payroll] Quota SMS SERVICE_CLIENT épuisé (remaining: ${result.quotaBefore}) → bloqué [${referenceType}]`,
                );
                return false;
            }

            this.logger.log(
                `[Payroll] Quota SMS décompté (avant: ${result.quotaBefore}, après: ${result.quotaAfter}) [${referenceType}]`,
            );
            return true;
        } catch (error: any) {
            this.logger.error(`[Payroll] Erreur quota SMS: ${error.message}`);
            return false;
        }
    }

    // ============================================================
    // 📢 NOTIFIER UN EMPLOYÉ PAR SMS APRÈS PAIEMENT
    // ============================================================
    private async notifyEmployeeAfterPayment(
        payslip: PayslipEntity,
        paidAt: Date,
        lang: string = 'fr',
    ): Promise<void> {
        try {
            // 1. Récupérer l'employé + son user
            const employee = await this.employeeRepo.findOne({
                where: { id: payslip.employeeId },
                relations: ['user'],
            });

            if (!employee) {
                this.logger.warn(
                    `[payRun] Employé ${payslip.employeeId} introuvable`,
                );
                return;
            }

            // 2. Téléphone (employé en priorité, sinon user)
            const phone = employee.phone || employee.user?.phone;
            if (!phone) {
                this.logger.warn(
                    `[payRun] Aucun téléphone pour ${employee.fullName}`,
                );
                return;
            }

            // 3. Préparer le message
            const netAmount = Number(payslip.netSalary);
            const currency = payslip.currency ?? 'CDF';
            const period = payslip.period;
            const formattedAmount = new Intl.NumberFormat(lang, {
                style: 'decimal',
                minimumFractionDigits: 0,
            }).format(netAmount);

            const smsMessage = await this.i18n.translate(
                'payroll.payment_sms_body',
                lang,
                {
                    name: employee.fullName,
                    amount: formattedAmount,
                    currency,
                    period,
                },
            );

            // 4. Consommer le quota
            const allowed = await this.consumeSmsQuota(
                payslip.id,
                'PAYROLL_PAYMENT',
                phone,
            );
            if (!allowed) {
                this.logger.warn(
                    `[payRun] SMS PAYROLL_PAYMENT bloqué (quota épuisé) pour ${phone}`,
                );
                return;
            }

            // 5. Envoi
            const sent = await this.smsService.sendSms(phone, smsMessage);
            if (sent) {
                this.logger.log(`✅ [payRun] SMS envoyé à ${phone}`);
            } else {
                this.logger.warn(`⚠️ [payRun] SMS non envoyé à ${phone}`);
            }
        } catch (err: any) {
            this.logger.error(
                `[payRun] Erreur notification SMS: ${err.message}`,
            );
        }
    }

    // ============================================================
    // ➕ CRÉER UN CYCLE (batch)
    // ============================================================
    async createRun(
        dto: CreatePayrollRunDto,
        currentUser: UserEntity,
        lang: string = 'fr',
    ) {
        // 1. Sélection des employés
        const qb = this.employeeRepo
            .createQueryBuilder('e')
            .leftJoinAndSelect('e.payrollItems', 'epi')
            .leftJoinAndSelect('epi.payrollItem', 'pi')
            .where('e.status = :status', { status: 'ACTIVE' });

        if (currentUser.activeCompanyId) {
            qb.andWhere('e.companyId = :companyId', {
                companyId: currentUser.activeCompanyId,
            });
        }
        if (dto.branchId)
            qb.andWhere('e.branchId = :branchId', { branchId: dto.branchId });
        if (dto.departmentId)
            qb.andWhere('e.departmentId = :departmentId', {
                departmentId: dto.departmentId,
            });
        if (dto.employeeIds?.length)
            qb.andWhere('e.id IN (:...ids)', { ids: dto.employeeIds });

        const employees = await qb.getMany();

        if (!employees.length) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.no_employees', lang),
            );
        }

        // 2. Créer le cycle
        const run = this.runRepo.create({
            reference: await this.generateRunReference(dto.period),
            period: dto.period,
            periodStart: new Date(dto.periodStart),
            periodEnd: new Date(dto.periodEnd),
            companyId: currentUser.activeCompanyId,
            branchId: dto.branchId,
            status: PayrollRunStatus.DRAFT,
            createdById: currentUser.id,
            notes: dto.notes,
        });

        const savedRun = await this.runRepo.save(run);

        // 3. Générer les fiches
        let totalGross = 0,
            totalDeductions = 0,
            totalNet = 0;

        for (const employee of employees) {
            const payslip = await this.generatePayslip(
                savedRun,
                employee,
                dto,
            );
            totalGross += Number(payslip.grossSalary);
            totalDeductions += Number(payslip.totalDeductions);
            totalNet += Number(payslip.netSalary);
        }

        savedRun.totalGross = totalGross;
        savedRun.totalDeductions = totalDeductions;
        savedRun.totalNet = totalNet;
        savedRun.employeeCount = employees.length;
        await this.runRepo.save(savedRun);

        return {
            message: await this.i18n.translate('payroll.run_created', lang, {
                count: employees.length,
            }),
            data: await this.runRepo.findOne({
                where: { id: savedRun.id },
                relations: [
                    'payslips',
                    'payslips.employee',
                    'payslips.lines',
                ],
            }),
        };
    }

    // ============================================================
    // 📄 GÉNÉRATION D'UNE FICHE DE PAIE
    // ============================================================
    private async generatePayslip(
        run: PayrollRunEntity,
        employee: EmployeeEntity,
        dto: CreatePayrollRunDto,
    ): Promise<PayslipEntity> {
        const currency = employee.currency ?? 'CDF';
        const baseSalary = Number(employee.baseSalary ?? 0);

        const payslip = this.payslipRepo.create({
            reference: `${run.reference}-${employee.id
                .slice(0, 8)
                .toUpperCase()}`,
            payrollRunId: run.id,
            employeeId: employee.id,
            period: dto.period,
            periodStart: new Date(dto.periodStart),
            periodEnd: new Date(dto.periodEnd),
            currency,
            baseSalary,
            status: PayslipStatus.DRAFT,
        });

        const savedPayslip = await this.payslipRepo.save(payslip);
        const lines: PayslipLineEntity[] = [];

        // Ligne de base
        lines.push(
            this.lineRepo.create({
                payslipId: savedPayslip.id,
                type: PayslipLineType.EARNING,
                code: 'BASE',
                label: 'BASE',                  // ← juste le code, la traduction se fera à l'affichage
                amount: baseSalary,
            }),
        );

        // Items configurés
        const employeeItems = (employee as any).payrollItems ?? [];
        for (const empItem of employeeItems) {
            if (!empItem.isActive) continue;
            const item = empItem.payrollItem;
            if (!item || !item.isActive) continue;

            const value = empItem.overrideValue ?? item.value;
            let amount = 0;

            if (item.calculation === PayrollItemCalculation.FIXED) {
                amount = Number(value);
            } else if (
                item.calculation === PayrollItemCalculation.PERCENTAGE
            ) {
                amount = (baseSalary * Number(value)) / 100;
            } else if (
                item.calculation === PayrollItemCalculation.PERCENTAGE_NET
            ) {
                continue;
            }

            if (item.code === 'BASE') continue;

            lines.push(
                this.lineRepo.create({
                    payslipId: savedPayslip.id,
                    type: item.type,
                    code: item.code,
                    label: item.label,
                    amount:
                        item.type === PayslipLineType.DEDUCTION
                            ? -Math.abs(amount)
                            : Math.abs(amount),
                    rate:
                        item.calculation !== PayrollItemCalculation.FIXED
                            ? Number(value)
                            : undefined,
                }),
            );
        }

        // Déduire les avances en cours
        const pendingAdvances =
            await this.agentPaymentsService.getEmployeeAdvances(
                employee.id,
                true,
                'fr',
            );

        for (const advance of pendingAdvances.data) {
            lines.push(
                this.lineRepo.create({
                    payslipId: savedPayslip.id,
                    type: PayslipLineType.DEDUCTION,
                    code: 'AVANCE',
                    label: `Avance ${advance.reference ?? ''}`,
                    amount: -Math.abs(Number(advance.amount)),
                    notes: `Avance du ${this.toIsoString(advance.createdAt as any) ?? ''
                        }`,
                }),
            );
        }

        // Calculer le brut pour les items PERCENTAGE_NET
        const grossBeforeNetItems = lines
            .filter((l) => l.type === PayslipLineType.EARNING)
            .reduce((s, l) => s + Number(l.amount), 0);

        const totalDeductionsBeforeNetItems = lines
            .filter((l) => l.type === PayslipLineType.DEDUCTION)
            .reduce((s, l) => s + Math.abs(Number(l.amount)), 0);

        const netBeforeNetItems =
            grossBeforeNetItems - totalDeductionsBeforeNetItems;

        // Ajouter les items PERCENTAGE_NET
        for (const empItem of employeeItems) {
            if (!empItem.isActive) continue;
            const item = empItem.payrollItem;
            if (!item || !item.isActive) continue;
            if (item.calculation !== PayrollItemCalculation.PERCENTAGE_NET)
                continue;

            const value = empItem.overrideValue ?? item.value;
            const amount = (netBeforeNetItems * Number(value)) / 100;

            lines.push(
                this.lineRepo.create({
                    payslipId: savedPayslip.id,
                    type: item.type,
                    code: item.code,
                    label: item.label,
                    amount:
                        item.type === PayslipLineType.DEDUCTION
                            ? -Math.abs(amount)
                            : Math.abs(amount),
                    rate: Number(value),
                }),
            );
        }

        await this.lineRepo.save(lines);

        // Recalculer les totaux de la fiche
        const earnings = lines
            .filter((l) => l.type === PayslipLineType.EARNING)
            .reduce((s, l) => s + Number(l.amount), 0);

        const deductions = lines
            .filter((l) => l.type === PayslipLineType.DEDUCTION)
            .reduce((s, l) => s + Math.abs(Number(l.amount)), 0);

        const advancesTotal = lines
            .filter((l) => l.code === 'AVANCE')
            .reduce((s, l) => s + Math.abs(Number(l.amount)), 0);

        savedPayslip.totalEarnings = earnings - baseSalary;
        savedPayslip.totalDeductions = deductions;
        savedPayslip.grossSalary = earnings;
        savedPayslip.netSalary = earnings - deductions;
        savedPayslip.advancesDeducted = advancesTotal;

        return this.payslipRepo.save(savedPayslip);
    }

    // ============================================================
    // 📋 LISTER LES CYCLES
    // ============================================================
    async findAllRuns(
        currentUser: UserEntity,
        filters: {
            status?: PayrollRunStatus;
            period?: string;
            page?: number;
            limit?: number;
        },
        lang: string = 'fr',
    ) {
        const page = Math.max(1, Number(filters.page) || 1);
        const limit = Math.min(Math.max(1, Number(filters.limit) || 20), 100);
        const skip = (page - 1) * limit;

        const qb = this.runRepo
            .createQueryBuilder('run')
            .leftJoinAndSelect('run.company', 'company')
            .leftJoinAndSelect('run.branch', 'branch')
            .orderBy('run.createdAt', 'DESC')
            .skip(skip)
            .take(limit);

        if (currentUser.activeCompanyId) {
            qb.andWhere('run.companyId = :companyId', {
                companyId: currentUser.activeCompanyId,
            });
        }
        if (filters.status)
            qb.andWhere('run.status = :status', { status: filters.status });
        if (filters.period)
            qb.andWhere('run.period = :period', { period: filters.period });

        const [data, total] = await qb.getManyAndCount();

        return {
            message: await this.i18n.translate('payroll.runs_list', lang, {
                count: data.length,
            }),
            data: {
                items: data,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    // ============================================================
    // 🔍 VOIR UN CYCLE COMPLET
    // ============================================================
    async findOneRun(id: string, lang: string = 'fr') {
        const run = await this.runRepo.findOne({
            where: { id },
            relations: [
                'payslips',
                'payslips.employee',
                'payslips.employee.department',
                'payslips.employee.branch',
                'payslips.lines',
                'payslips.payment',
                'company',
                'branch',
            ],
        });

        if (!run) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.run_not_found', lang, {
                    id,
                }),
            );
        }

        return {
            message: await this.i18n.translate('payroll.run_found', lang),
            data: run,
        };
    }

    // ============================================================
    // ✅ VALIDER UN CYCLE
    // ============================================================
    async validateRun(
        id: string,
        currentUser: UserEntity,
        lang: string = 'fr',
    ) {
        const run = await this.runRepo.findOne({
            where: { id },
            relations: ['payslips'],
        });

        if (!run)
            throw new NotFoundException(
                await this.i18n.translate('payroll.run_not_found', lang, {
                    id,
                }),
            );

        if (run.status !== PayrollRunStatus.DRAFT) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.run_not_draft', lang, {
                    status: run.status,
                }),
            );
        }

        if (!run.payslips?.length) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.run_no_payslips', lang),
            );
        }

        const negative = run.payslips.find((p) => Number(p.netSalary) < 0);
        if (negative) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.run_negative_net', lang, {
                    employeeId: negative.employeeId,
                }),
            );
        }

        await this.payslipRepo.update(
            { payrollRunId: id },
            { status: PayslipStatus.VALIDATED },
        );

        run.status = PayrollRunStatus.VALIDATED;
        run.validatedById = currentUser.id;
        run.validatedAt = new Date();
        const saved = await this.runRepo.save(run);

        return {
            message: await this.i18n.translate('payroll.run_validated', lang),
            data: saved,
        };
    }

    // ============================================================
    // 💰 PAYER UN CYCLE → crée N AgentPaymentEntity + SMS
    // ============================================================
    async payRun(
        id: string,
        dto: PayPayrollRunDto,
        currentUser: UserEntity,
        lang: string = 'fr',
    ) {
        const run = await this.runRepo.findOne({
            where: { id },
            relations: ['payslips', 'payslips.employee', 'payslips.lines'],
        });

        if (!run)
            throw new NotFoundException(
                await this.i18n.translate('payroll.run_not_found', lang, {
                    id,
                }),
            );

        if (run.status !== PayrollRunStatus.VALIDATED) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.run_not_validated', lang, {
                    status: run.status,
                }),
            );
        }

        const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
        const payslipsToNotify: PayslipEntity[] = [];

        // ✅ 1. TRANSACTION
        await this.dataSource.transaction(async (manager) => {
            for (const payslip of run.payslips) {
                // ============================================================
                // ✅ NOUVEAU : Paiement automatique FPay si method === FPAY
                // ============================================================
                if (dto.method === PaymentMethod.FPAY) {
                    // 🔍 1. Récupérer l'employé + son user pour obtenir userIdFpay
                    const employee = await this.employeeRepo.findOne({
                        where: { id: payslip.employeeId },
                        relations: ['user'],
                    });

                    if (!employee) {
                        throw new NotFoundException(
                            await this.i18n.translate(
                                'payroll.employee_not_found',
                                lang,
                                { id: payslip.employeeId },
                            ),
                        );
                    }

                    // 🔍 2. Vérifier que l'employé a un compte FPay lié
                    const employeeUserIdFpay = employee.user?.userIdFpay;

                    if (!employeeUserIdFpay) {
                        this.logger.warn(
                            `⚠️ [payRun] Employé ${employee.fullName} (${employee.id}) n'a pas de userIdFpay → paiement FPay ignoré`,
                        );
                        // ⏭️ On passe au suivant (ou on crée quand même le paiement ?)
                        // → À vous de décider. Ici on skip.
                        continue;
                    }

                    // 🔍 3. Calculer le montant net à envoyer
                    const netAmount = Number(payslip.netSalary);

                    if (netAmount <= 0) {
                        this.logger.warn(
                            `⚠️ [payRun] Montant net nul pour ${employee.fullName} → skip`,
                        );
                        continue;
                    }

                    // 🔥 4. Envoi FPay automatique
                    try {
                        this.logger.log(
                            `💰 [payRun] Envoi FPAY SALARY: ${employee.fullName} → ${netAmount} ${payslip.currency}`,
                        );

                        await this.fpayService.makeSendSalary(
                            {
                                userId: employeeUserIdFpay,          // ✅ userIdFpay de l'employé
                                amount: netAmount,
                                currency: payslip.currency || 'USD',
                                countryCode: 'CD',
                                description: `Paie ${payslip.period} - ${employee.fullName}`,
                            },
                            currentUser,
                        );

                        this.logger.log(
                            `✅ [payRun] FPAY SALARY envoyé pour ${employee.fullName}`,
                        );
                    } catch (fpayError: any) {
                        this.logger.error(
                            `❌ [payRun] Erreur FPAY pour ${employee.fullName}: ${fpayError.message}`,
                        );
                        // ⚠️ On continue avec les autres employés (pas de throw global)
                        // → Mais on log l'erreur pour audit
                    }
                }

                // ============================================================
                // 📝 5. Créer l'enregistrement de paiement (dans tous les cas)
                // ============================================================
                const paymentResult = await this.agentPaymentsService.create(
                    {
                        employeeId: payslip.employeeId,
                        type: PaymentType.SALARY,
                        amount: Number(payslip.baseSalary),
                        bonus: Number(payslip.totalEarnings),
                        deduction:
                            Number(payslip.totalDeductions) -
                            Number(payslip.advancesDeducted),
                        currency: payslip.currency,
                        period: payslip.period,
                        periodStart: this.toIsoString(payslip.periodStart),
                        periodEnd: this.toIsoString(payslip.periodEnd),
                        method: dto.method,
                        status: PaymentStatus.PAID,
                        description: `Paie ${payslip.period} - ${payslip.employee.fullName}`,
                        notes: payslip.notes,
                    },
                    currentUser,
                    lang,
                );

                payslip.paymentId = paymentResult.data.id;
                payslip.status = PayslipStatus.PAID;
                payslip.paidAt = paidAt;
                await manager.save(payslip);

                payslipsToNotify.push(payslip);
            }

            run.status = PayrollRunStatus.PAID;
            run.paidById = currentUser.id;
            run.paidAt = paidAt;
            await manager.save(run);
        });

        // ✅ 2. SMS EN ARRIÈRE-PLAN (non bloquant)
        setImmediate(async () => {
            try {
                const results = await Promise.allSettled(
                    payslipsToNotify.map((payslip) =>
                        this.notifyEmployeeAfterPayment(payslip, paidAt, lang),
                    ),
                );

                const success = results.filter(
                    (r) => r.status === 'fulfilled',
                ).length;
                const failed = results.filter(
                    (r) => r.status === 'rejected',
                ).length;

                this.logger.log(
                    `📢 [payRun] Notifications SMS: ${success} succès, ${failed} échecs sur ${payslipsToNotify.length}`,
                );
            } catch (err: any) {
                this.logger.error(
                    `[payRun] Erreur batch notifications: ${err.message}`,
                );
            }
        });

        // ✅ 3. Réponse immédiate
        return this.findOneRun(id, lang);
    }

    // ============================================================
    // ❌ ANNULER UN CYCLE
    // ============================================================
    async cancelRun(
        id: string,
        currentUser: UserEntity,
        lang: string = 'fr',
    ) {
        const run = await this.runRepo.findOne({
            where: { id },
            relations: ['payslips'],
        });
        if (!run)
            throw new NotFoundException(
                await this.i18n.translate('payroll.run_not_found', lang, {
                    id,
                }),
            );

        if (run.status === PayrollRunStatus.PAID) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.run_already_paid', lang),
            );
        }

        await this.payslipRepo.update(
            { payrollRunId: id },
            { status: PayslipStatus.CANCELLED },
        );

        run.status = PayrollRunStatus.CANCELLED;
        const saved = await this.runRepo.save(run);

        return {
            message: await this.i18n.translate('payroll.run_cancelled', lang),
            data: saved,
        };
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN CYCLE
    // ============================================================
    async removeRun(id: string, lang: string = 'fr') {
        const run = await this.runRepo.findOne({ where: { id } });
        if (!run)
            throw new NotFoundException(
                await this.i18n.translate('payroll.run_not_found', lang, {
                    id,
                }),
            );

        if (
            run.status !== PayrollRunStatus.DRAFT &&
            run.status !== PayrollRunStatus.CANCELLED
        ) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.run_cannot_delete', lang, {
                    status: run.status,
                }),
            );
        }

        await this.runRepo.remove(run);
        return {
            message: await this.i18n.translate('payroll.run_deleted', lang),
        };
    }

    // ============================================================
    // 🔢 GÉNÉRATION DE RÉFÉRENCE
    // ============================================================
    private async generateRunReference(period: string): Promise<string> {
        const cleanPeriod = period.replace('-', '');
        const count = await this.runRepo.count({ where: { period } });
        const sequence = String(count + 1).padStart(4, '0');
        return `PAY-${cleanPeriod}-${sequence}`;
    }
}