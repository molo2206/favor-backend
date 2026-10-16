import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollItemEntity } from '../entities/payroll-item.entity';
import { EmployeePayrollItemEntity } from '../entities/employee-payroll-item.entity';
import { EmployeeEntity } from '../../employees/entities/employee.entity';
import { CreatePayrollItemDto } from '../dto/create-payroll-item.dto';
import { AssignPayrollItemDto } from '../dto/assign-payroll-item.dto';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';

@Injectable()
export class PayrollItemService {
    constructor(
        @InjectRepository(PayrollItemEntity)
        private readonly itemRepo: Repository<PayrollItemEntity>,
        @InjectRepository(EmployeePayrollItemEntity)
        private readonly empItemRepo: Repository<EmployeePayrollItemEntity>,
        @InjectRepository(EmployeeEntity)
        private readonly employeeRepo: Repository<EmployeeEntity>,
        private readonly i18n: I18nService,
    ) { }

    // ============================================================
    // ➕ CRÉER UN ITEM (retenue ou avantage)
    // ============================================================
    async create(
        dto: CreatePayrollItemDto,
        currentUser: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: PayrollItemEntity }> {
        // Vérifier unicité du code dans la company
        const exists = await this.itemRepo.findOne({
            where: { code: dto.code, companyId: currentUser.activeCompanyId },
        });
        if (exists) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.item_code_exists', lang, {
                    code: dto.code,
                }),
            );
        }

        const item = this.itemRepo.create({
            ...dto,
            companyId: currentUser.activeCompanyId,
        });
        const saved = await this.itemRepo.save(item);

        return {
            message: await this.i18n.translate('payroll.item_created', lang),
            data: saved,
        };
    }

    // ============================================================
    // 📋 LISTER LES ITEMS
    // ============================================================
    async findAll(
        currentUser: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: PayrollItemEntity[] }> {
        const items = await this.itemRepo.find({
            where: { companyId: currentUser.activeCompanyId },
            order: { type: 'ASC', order: 'ASC' },
        });
        return {
            message: await this.i18n.translate('payroll.items_list', lang, {
                count: items.length,
            }),
            data: items,
        };
    }

    // ============================================================
    // 🔍 VOIR UN ITEM
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: PayrollItemEntity }> {
        const item = await this.itemRepo.findOne({ where: { id } });
        if (!item) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.item_not_found', lang, { id }),
            );
        }
        return {
            message: await this.i18n.translate('payroll.item_found', lang),
            data: item,
        };
    }

    // ============================================================
    // ✏️ MODIFIER UN ITEM
    // ============================================================
    async update(
        id: string,
        dto: Partial<CreatePayrollItemDto>,
        lang: string = 'fr',
    ): Promise<{ message: string; data: PayrollItemEntity }> {
        const item = await this.itemRepo.findOne({ where: { id } });
        if (!item) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.item_not_found', lang, { id }),
            );
        }

        // Si le code change, vérifier l'unicité
        if (dto.code && dto.code !== item.code) {
            const exists = await this.itemRepo.findOne({
                where: { code: dto.code, companyId: item.companyId },
            });
            if (exists) {
                throw new BadRequestException(
                    await this.i18n.translate('payroll.item_code_exists', lang, {
                        code: dto.code,
                    }),
                );
            }
        }

        Object.assign(item, dto);
        const saved = await this.itemRepo.save(item);

        return {
            message: await this.i18n.translate('payroll.item_updated', lang),
            data: saved,
        };
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN ITEM
    // ============================================================
    async remove(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string }> {
        const item = await this.itemRepo.findOne({ where: { id } });
        if (!item) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.item_not_found', lang, { id }),
            );
        }

        // Vérifier si l'item est assigné à des employés
        const assignments = await this.empItemRepo.count({
            where: { payrollItemId: id },
        });

        if (assignments > 0) {
            throw new BadRequestException(
                await this.i18n.translate('payroll.item_in_use', lang, {
                    count: assignments,
                }),
            );
        }

        await this.itemRepo.remove(item);
        return {
            message: await this.i18n.translate('payroll.item_deleted', lang),
        };
    }

    // ============================================================
    // 🔗 ASSIGNER UN ITEM À UN EMPLOYÉ
    // ============================================================
    async assignToEmployee(
        employeeId: string,
        dto: AssignPayrollItemDto,
        currentUser: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: EmployeePayrollItemEntity }> {
        // Vérifier l'employé
        const employee = await this.employeeRepo.findOne({
            where: { id: employeeId },
        });
        if (!employee) {
            throw new NotFoundException(
                await this.i18n.translate('employee.not_found_by_id', lang, {
                    id: employeeId,
                }),
            );
        }

        // 🔒 Multi-tenant
        if (
            currentUser.activeCompanyId &&
            employee.companyId &&
            employee.companyId !== currentUser.activeCompanyId
        ) {
            throw new NotFoundException(
                await this.i18n.translate('employee.not_found_by_id', lang, {
                    id: employeeId,
                }),
            );
        }

        // Vérifier l'item
        const item = await this.itemRepo.findOne({
            where: { id: dto.payrollItemId },
        });
        if (!item) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.item_not_found', lang, {
                    id: dto.payrollItemId,
                }),
            );
        }

        // Vérifier ou créer l'assignation
        let existing = await this.empItemRepo.findOne({
            where: { employeeId, payrollItemId: dto.payrollItemId },
        });

        if (existing) {
            Object.assign(existing, {
                isActive: dto.isActive ?? existing.isActive,
                overrideValue: dto.overrideValue ?? existing.overrideValue,
            });
            await this.empItemRepo.save(existing);
        } else {
            existing = this.empItemRepo.create({
                employeeId,
                payrollItemId: dto.payrollItemId,
                isActive: dto.isActive ?? true,
                overrideValue: dto.overrideValue,
            });
            await this.empItemRepo.save(existing);
        }

        const reloaded = await this.empItemRepo.findOne({
            where: { id: existing.id },
            relations: ['payrollItem'],
        });

        return {
            message: await this.i18n.translate('payroll.item_assigned', lang),
            data: reloaded!,
        };
    }

    // ============================================================
    // 📋 LISTER LES ITEMS D'UN EMPLOYÉ
    // ============================================================
    async findEmployeeItems(
        employeeId: string,
        currentUser: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: EmployeePayrollItemEntity[] }> {
        const employee = await this.employeeRepo.findOne({
            where: { id: employeeId },
        });
        if (!employee) {
            throw new NotFoundException(
                await this.i18n.translate('employee.not_found_by_id', lang, {
                    id: employeeId,
                }),
            );
        }

        // 🔒 Multi-tenant
        if (
            currentUser.activeCompanyId &&
            employee.companyId &&
            employee.companyId !== currentUser.activeCompanyId
        ) {
            throw new NotFoundException(
                await this.i18n.translate('employee.not_found_by_id', lang, {
                    id: employeeId,
                }),
            );
        }

        const items = await this.empItemRepo.find({
            where: { employeeId },
            relations: ['payrollItem'],
            order: { payrollItem: { order: 'ASC' } },
        });

        return {
            message: await this.i18n.translate('payroll.employee_items_list', lang, {
                count: items.length,
            }),
            data: items,
        };
    }

    // ============================================================
    // 🗑️ RETIRER UN ITEM D'UN EMPLOYÉ
    // ============================================================
    async removeFromEmployee(
        employeeId: string,
        payrollItemId: string,
        lang: string = 'fr',
    ): Promise<{ message: string }> {
        const existing = await this.empItemRepo.findOne({
            where: { employeeId, payrollItemId },
        });
        if (!existing) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.assignment_not_found', lang, {
                    employeeId,
                    payrollItemId,
                }),
            );
        }

        await this.empItemRepo.remove(existing);
        return {
            message: await this.i18n.translate('payroll.item_unassigned', lang),
        };
    }

    // ============================================================
    // 🔄 ACTIVER / DÉSACTIVER UN ITEM POUR UN EMPLOYÉ
    // ============================================================
    async toggleEmployeeItem(
        employeeId: string,
        payrollItemId: string,
        isActive: boolean,
        lang: string = 'fr',
    ): Promise<{ message: string; data: EmployeePayrollItemEntity }> {
        const existing = await this.empItemRepo.findOne({
            where: { employeeId, payrollItemId },
            relations: ['payrollItem'],
        });
        if (!existing) {
            throw new NotFoundException(
                await this.i18n.translate('payroll.assignment_not_found', lang, {
                    employeeId,
                    payrollItemId,
                }),
            );
        }

        existing.isActive = isActive;
        const saved = await this.empItemRepo.save(existing);

        return {
            message: await this.i18n.translate('payroll.item_toggled', lang, {
                state: isActive
                    ? await this.i18n.translate('payroll.item_activated', lang)
                    : await this.i18n.translate('payroll.item_deactivated', lang),
            }),
            data: saved,
        };
    }
    // ============================================================
    // 📊 ITEMS ACTIFS D'UN EMPLOYÉ (pour calcul de paie)
    // ============================================================
    async getActiveItemsForEmployee(
        employeeId: string,
    ): Promise<EmployeePayrollItemEntity[]> {
        return this.empItemRepo.find({
            where: { employeeId, isActive: true },
            relations: ['payrollItem'],
            order: { payrollItem: { order: 'ASC' } },
        });
    }
}