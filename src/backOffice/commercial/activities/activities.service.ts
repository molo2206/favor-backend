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
import { CustomerEntity } from '../customers/entities/customer.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { I18nService } from 'src/libs/common/src';

@Injectable()
export class ActivitiesService {
    constructor(
        @InjectRepository(ActivityEntity)
        private readonly activityRepo: Repository<ActivityEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepo: Repository<UserEntity>,

        @InjectRepository(ProspectEntity)
        private readonly prospectRepo: Repository<ProspectEntity>,

        @InjectRepository(CustomerEntity)
        private readonly customerRepo: Repository<CustomerEntity>,

        private readonly i18nService: I18nService,
    ) { }

    // ============================================================
    // 🔒 VÉRIFIER UN COMMERCIAL
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

    // ============================================================
    // 🔒 VÉRIFIER UN PROSPECT
    // ============================================================
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

    // ============================================================
    // 🔒 VÉRIFIER UN CLIENT
    // ============================================================
    private async validateCustomer(
        customerId: string,
        lang: string = 'fr',
    ): Promise<CustomerEntity> {
        const customer = await this.customerRepo.findOne({
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
    // ➕ CRÉER UNE ACTIVITÉ
    // ============================================================
    async create(
        dto: CreateActivityDto,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ActivityEntity }> {
        // 1. Validations de base
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

        // 2. Vérifier le commercial
        if (!dto.salesRepId) {
            throw new BadRequestException(
                await this.i18nService.translate('activity.sales_rep_required', lang),
            );
        }
        await this.validateSalesRep(dto.salesRepId, lang);

        // 3. Vérifier le prospect (si fourni)
        if (dto.prospectId) {
            await this.validateProspect(dto.prospectId, lang);
        }

        // 4. Vérifier le client (si fourni)
        if (dto.customerId) {
            await this.validateCustomer(dto.customerId, lang);
        }

        // 5. Création
        const activity = this.activityRepo.create({
            ...dto,
            subject: dto.subject.trim(),
            description: dto.description?.trim(),
            result: dto.result?.trim(),
            nextAction: dto.nextAction?.trim(),
            date: new Date(dto.date),
            nextActionAt: dto.nextActionAt ? new Date(dto.nextActionAt) : undefined,
        });

        const saved = await this.activityRepo.save(activity);

        return {
            message: await this.i18nService.translate('activity.created_success', lang, {
                subject: saved.subject,
            }),
            data: saved,
        };
    }

    // ============================================================
    // 📋 LISTER LES ACTIVITÉS
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
            .leftJoinAndSelect('a.salesRep', 'salesRep')
            .leftJoinAndSelect('a.prospect', 'prospect')
            .leftJoinAndSelect('a.customer', 'customer')
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

        // Pagination
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
            data: new PaginatedResponseDto(
                activities,
                total,
                currentPage,
                currentLimit,
            ),
        };
    }

    // ============================================================
    // 🔍 VOIR UNE ACTIVITÉ
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ActivityEntity }> {
        const activity = await this.activityRepo.findOne({
            where: { id },
            relations: ['salesRep', 'prospect', 'customer'],
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
    // ✏️ MODIFIER UNE ACTIVITÉ
    // ============================================================
    async update(
        id: string,
        dto: UpdateActivityDto,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ActivityEntity }> {
        const { data: activity } = await this.findOne(id, lang);

        // 1. Validation sujet
        if (dto.subject !== undefined && (!dto.subject || dto.subject.trim() === '')) {
            throw new BadRequestException(
                await this.i18nService.translate('activity.subject_required', lang),
            );
        }

        // 2. Vérifier le nouveau commercial (si changé)
        if (dto.salesRepId && dto.salesRepId !== activity.salesRepId) {
            await this.validateSalesRep(dto.salesRepId, lang);
        }

        // 3. Vérifier le nouveau prospect (si changé)
        if (dto.prospectId && dto.prospectId !== activity.prospectId) {
            await this.validateProspect(dto.prospectId, lang);
        }

        // 4. Vérifier le nouveau client (si changé)
        if (dto.customerId && dto.customerId !== activity.customerId) {
            await this.validateCustomer(dto.customerId, lang);
        }

        // 5. Appliquer les modifs
        Object.assign(activity, {
            ...dto,
            ...(dto.subject !== undefined && { subject: dto.subject.trim() }),
            ...(dto.description !== undefined && { description: dto.description?.trim() }),
            ...(dto.result !== undefined && { result: dto.result?.trim() }),
            ...(dto.nextAction !== undefined && { nextAction: dto.nextAction?.trim() }),
            ...(dto.date && { date: new Date(dto.date) }),
            ...(dto.nextActionAt && { nextActionAt: new Date(dto.nextActionAt) }),
        });

        const updated = await this.activityRepo.save(activity);

        return {
            message: await this.i18nService.translate('activity.updated_success', lang, {
                subject: updated.subject,
            }),
            data: updated,
        };
    }

    // ============================================================
    // 🗑️ SUPPRIMER UNE ACTIVITÉ
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