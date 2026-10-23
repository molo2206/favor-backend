import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityEntity } from './entities/activity.entity';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { ProspectEntity } from '../prospects/entities/prospect.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { I18nService } from 'src/libs/common/src';

/**
 * ✅ Relations chargées pour le front.
 * ⚠️ Si vous ajoutez `activeBranch`/`activeCompany`, vérifiez que
 *    `BranchEntity` et `CompanyEntity` sont dans TypeOrmModule.forFeature.
 */
const FULL_RELATIONS = [
    // Sales rep
    'salesRep',
    'salesRep.activeCompany',

    // Customer
    'customer',
    'customer.activeCompany',

    // Prospect
    'prospect',
    'prospect.company',
    'prospect.branch',
    'prospect.assignedTo',
    'prospect.assignedTo.activeCompany',
];

@Injectable()
export class ActivitiesService {
    constructor(
        @InjectRepository(ActivityEntity)
        private readonly activityRepo: Repository<ActivityEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepo: Repository<UserEntity>,

        @InjectRepository(ProspectEntity)
        private readonly prospectRepo: Repository<ProspectEntity>,

        private readonly i18nService: I18nService,
    ) { }

    // ============================================================
    // 🔒 VALIDATIONS
    // ============================================================
    private async validateSalesRep(
        salesRepId: string,
        lang: string = 'fr',
    ): Promise<UserEntity> {
        const salesRep = await this.userRepo.findOne({
            where: { id: salesRepId },
        });

        if (!salesRep) {
            throw new NotFoundException(
                await this.i18nService.translate('activity.sales_rep_not_found', lang, {
                    id: salesRepId,
                }),
            );
        }

        if (!salesRep.isActive) {
            throw new BadRequestException(
                await this.i18nService.translate('activity.sales_rep_inactive', lang, {
                    name: salesRep.fullName,
                }),
            );
        }

        return salesRep;
    }

    private async validateProspect(
        prospectId: string,
        lang: string = 'fr',
    ): Promise<ProspectEntity> {
        const prospect = await this.prospectRepo.findOne({
            where: { id: prospectId },
        });

        if (!prospect) {
            throw new NotFoundException(
                await this.i18nService.translate('activity.prospect_not_found', lang, {
                    id: prospectId,
                }),
            );
        }

        return prospect;
    }

    private async validateCustomer(
        customerId: string,
        lang: string = 'fr',
    ): Promise<UserEntity> {
        const customer = await this.userRepo.findOne({
            where: { id: customerId },
        });

        if (!customer) {
            throw new NotFoundException(
                await this.i18nService.translate('activity.customer_not_found', lang, {
                    id: customerId,
                }),
            );
        }

        return customer;
    }

    // ============================================================
    // ➕ CRÉER
    // ============================================================
    async create(
        dto: CreateActivityDto,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ActivityEntity }> {
        if (!dto.subject || dto.subject.trim() === '') {
            throw new BadRequestException(
                await this.i18nService.translate('activity.subject_required', lang),
            );
        }

        if (!dto.type) {
            throw new BadRequestException(
                await this.i18nService.translate('activity.type_required', lang),
            );
        }

        if (!dto.date) {
            throw new BadRequestException(
                await this.i18nService.translate('activity.date_required', lang),
            );
        }

        if (dto.salesRepId) await this.validateSalesRep(dto.salesRepId, lang);
        if (dto.prospectId) await this.validateProspect(dto.prospectId, lang);
        if (dto.customerId) await this.validateCustomer(dto.customerId, lang);

        const activity = this.activityRepo.create({
            type: dto.type,
            subject: dto.subject.trim(),
            description: dto.description?.trim(),
            result: dto.result?.trim(),
            nextAction: dto.nextAction?.trim(),
            date: new Date(dto.date),
            nextActionAt: dto.nextActionAt ? new Date(dto.nextActionAt) : undefined,
            salesRepId: dto.salesRepId,
            prospectId: dto.prospectId,
            customerId: dto.customerId,
        });

        const saved = await this.activityRepo.save(activity);

        const full = await this.activityRepo.findOne({
            where: { id: saved.id },
            relations: FULL_RELATIONS,
        });

        return {
            message: await this.i18nService.translate('activity.created_success', lang, {
                subject: saved.subject,
            }),
            data: full ?? saved,
        };
    }

    // ============================================================
    // 📋 LISTER
    // ============================================================
    async findAll(
        salesRepId?: string,
        prospectId?: string,
        customerId?: string,
        page: number = 1,
        limit: number = 10,
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<ActivityEntity>;
    }> {
        const query = this.activityRepo
            .createQueryBuilder('a')
            // ✅ Sales rep (sans activeBranch pour éviter l'erreur)
            .leftJoinAndSelect('a.salesRep', 'salesRep')
            .leftJoinAndSelect('salesRep.activeCompany', 'salesRepActiveCompany')
            // ✅ Prospect
            .leftJoinAndSelect('a.prospect', 'prospect')
            .leftJoinAndSelect('prospect.company', 'prospectCompany')
            .leftJoinAndSelect('prospect.branch', 'prospectBranch')
            .leftJoinAndSelect('prospect.assignedTo', 'prospectAssignedTo')
            .leftJoinAndSelect('prospectAssignedTo.activeCompany', 'prospectAssignedToActiveCompany')
            // ✅ Customer
            .leftJoinAndSelect('a.customer', 'customer')
            .leftJoinAndSelect('customer.activeCompany', 'customerActiveCompany')
            .orderBy('a.date', 'DESC');

        if (salesRepId?.trim()) {
            query.andWhere('a.salesRepId = :salesRepId', { salesRepId: salesRepId.trim() });
        }
        if (prospectId?.trim()) {
            query.andWhere('a.prospectId = :prospectId', { prospectId: prospectId.trim() });
        }
        if (customerId?.trim()) {
            query.andWhere('a.customerId = :customerId', { customerId: customerId.trim() });
        }

        const currentPage = Math.max(1, Number(page) || 1);
        const currentLimit = Math.max(1, Number(limit) || 10);
        const skip = (currentPage - 1) * currentLimit;

        query.skip(skip).take(currentLimit);

        const [activities, total] = await query.getManyAndCount();

        if (!activities.length) {
            throw new NotFoundException(
                await this.i18nService.translate('activity.not_found', lang),
            );
        }

        return {
            message: await this.i18nService.translate('activity.list_retrieved', lang),
            data: new PaginatedResponseDto(activities, total, currentPage, currentLimit),
        };
    }

    // ============================================================
    // 🔍 VOIR
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ActivityEntity }> {
        const activity = await this.activityRepo.findOne({
            where: { id },
            relations: FULL_RELATIONS,
        });

        if (!activity) {
            throw new NotFoundException(
                await this.i18nService.translate('activity.not_found_by_id', lang, { id }),
            );
        }

        return {
            message: await this.i18nService.translate('activity.found_success', lang, {
                subject: activity.subject,
            }),
            data: activity,
        };
    }

    // ============================================================
    // ✏️ MODIFIER
    // ============================================================
    async update(
        id: string,
        dto: UpdateActivityDto,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ActivityEntity }> {
        const { data: activity } = await this.findOne(id, lang);

        if (dto.subject !== undefined && (!dto.subject || dto.subject.trim() === '')) {
            throw new BadRequestException(
                await this.i18nService.translate('activity.subject_required', lang),
            );
        }

        if (dto.salesRepId && dto.salesRepId !== activity.salesRepId) {
            await this.validateSalesRep(dto.salesRepId, lang);
        }
        if (dto.prospectId && dto.prospectId !== activity.prospectId) {
            await this.validateProspect(dto.prospectId, lang);
        }
        if (dto.customerId && dto.customerId !== activity.customerId) {
            await this.validateCustomer(dto.customerId, lang);
        }

        Object.assign(activity, {
            ...(dto.type !== undefined && { type: dto.type }),
            ...(dto.subject !== undefined && { subject: dto.subject.trim() }),
            ...(dto.description !== undefined && { description: dto.description?.trim() }),
            ...(dto.result !== undefined && { result: dto.result?.trim() }),
            ...(dto.nextAction !== undefined && { nextAction: dto.nextAction?.trim() }),
            ...(dto.date && { date: new Date(dto.date) }),
            ...(dto.nextActionAt && { nextActionAt: new Date(dto.nextActionAt) }),
            ...(dto.salesRepId !== undefined && { salesRepId: dto.salesRepId }),
            ...(dto.prospectId !== undefined && { prospectId: dto.prospectId }),
            ...(dto.customerId !== undefined && { customerId: dto.customerId }),
        });

        const updated = await this.activityRepo.save(activity);

        const full = await this.activityRepo.findOne({
            where: { id: updated.id },
            relations: FULL_RELATIONS,
        });

        return {
            message: await this.i18nService.translate('activity.updated_success', lang, {
                subject: updated.subject,
            }),
            data: full ?? updated,
        };
    }

    // ============================================================
    // 🗑️ SUPPRIMER
    // ============================================================
    async remove(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string }> {
        const { data: activity } = await this.findOne(id, lang);
        await this.activityRepo.remove(activity);

        return {
            message: await this.i18nService.translate('activity.deleted_success', lang, {
                subject: activity.subject,
            }),
        };
    }
}