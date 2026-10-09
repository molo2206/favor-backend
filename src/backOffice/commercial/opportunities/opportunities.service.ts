import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpportunityEntity } from './entities/opportunity.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { OpportunityStage } from '../common/enums/opportunity-stage.enum';
import { CustomerEntity } from '../customers/entities/customer.entity';
import { ProspectEntity } from '../prospects/entities/prospect.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { I18nService } from 'src/libs/common/src';

@Injectable()
export class OpportunitiesService {
    constructor(
        @InjectRepository(OpportunityEntity)
        private readonly opportunityRepo: Repository<OpportunityEntity>,

        @InjectRepository(CustomerEntity)
        private readonly customerRepo: Repository<CustomerEntity>,

        @InjectRepository(ProspectEntity)
        private readonly prospectRepo: Repository<ProspectEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepo: Repository<UserEntity>,

        private readonly i18nService: I18nService,
    ) { }

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
                await this.i18nService.translate('opportunity.customer_not_found', lang, {
                    id: customerId,
                }),
            );
        }

        return customer;
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
                await this.i18nService.translate('opportunity.prospect_not_found', lang, {
                    id: prospectId,
                }),
            );
        }

        return prospect;
    }

    // ============================================================
    // 🔒 VÉRIFIER UN COMMERCIAL
    // ============================================================
    private async validateAssignedTo(
        userId: string,
        lang: string = 'fr',
    ): Promise<UserEntity> {
        const user = await this.userRepo.findOne({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException(
                await this.i18nService.translate('opportunity.assigned_to_not_found', lang, {
                    id: userId,
                }),
            );
        }

        if (!user.isActive) {
            throw new BadRequestException(
                await this.i18nService.translate('opportunity.assigned_to_inactive', lang, {
                    name: user.fullName,
                }),
            );
        }

        return user;
    }

    // ============================================================
    // ➕ CRÉER UNE OPPORTUNITÉ
    // ============================================================
    async create(
        dto: CreateOpportunityDto,
        lang: string = 'fr',
    ): Promise<{ message: string; data: OpportunityEntity }> {
        // 1. Validations de base
        if (!dto.title || dto.title.trim() === '') {
            throw new BadRequestException(
                await this.i18nService.translate('opportunity.title_required', lang),
            );
        }

        if (dto.amount === undefined || dto.amount === null || dto.amount < 0) {
            throw new BadRequestException(
                await this.i18nService.translate('opportunity.amount_required', lang),
            );
        }

        // 2. Vérifier qu'au moins un client OU prospect est fourni
        if (!dto.customerId && !dto.prospectId) {
            throw new BadRequestException(
                await this.i18nService.translate('opportunity.customer_or_prospect_required', lang),
            );
        }

        // 3. Vérifier le client (si fourni)
        if (dto.customerId) {
            await this.validateCustomer(dto.customerId, lang);
        }

        // 4. Vérifier le prospect (si fourni)
        if (dto.prospectId) {
            await this.validateProspect(dto.prospectId, lang);
        }

        // 5. Vérifier le commercial (si fourni)
        if (dto.assignedToId) {
            await this.validateAssignedTo(dto.assignedToId, lang);
        }

        // 6. Valeurs par défaut
        const stage = dto.stage || OpportunityStage.PROSPECTING;
        const probability = dto.probability ?? 0;

        // 7. Création
        const opportunity = this.opportunityRepo.create({
            ...dto,
            title: dto.title.trim(),
            description: dto.description?.trim(),
            stage,
            probability,
            currency: dto.currency || 'USD',
            expectedCloseDate: dto.expectedCloseDate
                ? new Date(dto.expectedCloseDate)
                : undefined,
        });

        const saved = await this.opportunityRepo.save(opportunity);

        return {
            message: await this.i18nService.translate('opportunity.created_success', lang, {
                title: saved.title,
            }),
            data: saved,
        };
    }

    // ============================================================
    // 📋 LISTER LES OPPORTUNITÉS
    // ============================================================
    async findAll(
        stage?: OpportunityStage,
        assignedToId?: string,
        customerId?: string,
        prospectId?: string,
        page: number = 1,
        limit: number = 10,
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<OpportunityEntity>;
    }> {
        const qb = this.opportunityRepo
            .createQueryBuilder('o')
            .leftJoinAndSelect('o.customer', 'customer')
            .leftJoinAndSelect('o.prospect', 'prospect')
            .leftJoinAndSelect('o.assignedTo', 'assignedTo')
            .orderBy('o.createdAt', 'DESC');

        if (stage) qb.andWhere('o.stage = :stage', { stage });
        if (assignedToId?.trim()) {
            qb.andWhere('o.assignedToId = :assignedToId', { assignedToId: assignedToId.trim() });
        }
        if (customerId?.trim()) {
            qb.andWhere('o.customerId = :customerId', { customerId: customerId.trim() });
        }
        if (prospectId?.trim()) {
            qb.andWhere('o.prospectId = :prospectId', { prospectId: prospectId.trim() });
        }

        // Pagination
        const currentPage = Math.max(1, Number(page) || 1);
        const currentLimit = Math.max(1, Number(limit) || 10);
        const skip = (currentPage - 1) * currentLimit;

        qb.skip(skip).take(currentLimit);

        const [opportunities, total] = await qb.getManyAndCount();

        if (!opportunities.length) {
            throw new NotFoundException(
                await this.i18nService.translate('opportunity.not_found', lang),
            );
        }

        return {
            message: await this.i18nService.translate('opportunity.list_retrieved', lang),
            data: new PaginatedResponseDto(opportunities, total, currentPage, currentLimit),
        };
    }

    // ============================================================
    // 🔍 VOIR UNE OPPORTUNITÉ
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: OpportunityEntity }> {
        const opportunity = await this.opportunityRepo.findOne({
            where: { id },
            relations: ['customer', 'prospect', 'assignedTo'],
        });

        if (!opportunity) {
            throw new NotFoundException(
                await this.i18nService.translate('opportunity.not_found_by_id', lang, { id }),
            );
        }

        return {
            message: await this.i18nService.translate('opportunity.found_success', lang, {
                title: opportunity.title,
            }),
            data: opportunity,
        };
    }

    // ============================================================
    // ✏️ MODIFIER UNE OPPORTUNITÉ
    // ============================================================
    async update(
        id: string,
        dto: UpdateOpportunityDto,
        lang: string = 'fr',
    ): Promise<{ message: string; data: OpportunityEntity }> {
        const { data: opportunity } = await this.findOne(id, lang);

        // 1. Validation titre
        if (dto.title !== undefined && (!dto.title || dto.title.trim() === '')) {
            throw new BadRequestException(
                await this.i18nService.translate('opportunity.title_required', lang),
            );
        }

        // 2. Validation montant
        if (dto.amount !== undefined && (dto.amount === null || dto.amount < 0)) {
            throw new BadRequestException(
                await this.i18nService.translate('opportunity.amount_invalid', lang),
            );
        }

        // 3. Vérifier le nouveau client (si changé)
        if (dto.customerId && dto.customerId !== opportunity.customerId) {
            await this.validateCustomer(dto.customerId, lang);
        }

        // 4. Vérifier le nouveau prospect (si changé)
        if (dto.prospectId && dto.prospectId !== opportunity.prospectId) {
            await this.validateProspect(dto.prospectId, lang);
        }

        // 5. Vérifier le nouveau commercial (si changé)
        if (dto.assignedToId && dto.assignedToId !== opportunity.assignedToId) {
            await this.validateAssignedTo(dto.assignedToId, lang);
        }

        // 6. Appliquer les modifs
        Object.assign(opportunity, {
            ...dto,
            ...(dto.title !== undefined && { title: dto.title.trim() }),
            ...(dto.description !== undefined && { description: dto.description?.trim() }),
            ...(dto.expectedCloseDate && { expectedCloseDate: new Date(dto.expectedCloseDate) }),
        });

        const updated = await this.opportunityRepo.save(opportunity);

        return {
            message: await this.i18nService.translate('opportunity.updated_success', lang, {
                title: updated.title,
            }),
            data: updated,
        };
    }

    // ============================================================
    // 🔄 CHANGER L'ÉTAPE (STAGE) D'UNE OPPORTUNITÉ
    // ============================================================
    async updateStage(
        id: string,
        stage: OpportunityStage,
        lang: string = 'fr',
    ): Promise<{ message: string; data: OpportunityEntity }> {
        const { data: opportunity } = await this.findOne(id, lang);

        if (!stage) {
            throw new BadRequestException(
                await this.i18nService.translate('opportunity.stage_required', lang),
            );
        }

        // 🔒 Empêcher de modifier une opportunité déjà WON/LOST
        if (
            opportunity.stage === OpportunityStage.WON ||
            opportunity.stage === OpportunityStage.LOST
        ) {
            throw new BadRequestException(
                await this.i18nService.translate('opportunity.cannot_change_closed_stage', lang, {
                    current: opportunity.stage,
                }),
            );
        }

        opportunity.stage = stage;
        const updated = await this.opportunityRepo.save(opportunity);

        return {
            message: await this.i18nService.translate('opportunity.stage_updated_success', lang, {
                stage,
            }),
            data: updated,
        };
    }

    // ============================================================
    // 🗑️ SUPPRIMER UNE OPPORTUNITÉ
    // ============================================================
    async remove(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string }> {
        const { data: opportunity } = await this.findOne(id, lang);
        await this.opportunityRepo.remove(opportunity);

        return {
            message: await this.i18nService.translate('opportunity.deleted_success', lang, {
                title: opportunity.title,
            }),
        };
    }

    // ============================================================
    // 📊 PIPELINE COMMERCIAL (vue groupée par stage)
    // ============================================================
    async getPipeline(
        assignedToId?: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: any[] }> {
        const qb = this.opportunityRepo
            .createQueryBuilder('o')
            .select('o.stage', 'stage')
            .addSelect('COUNT(o.id)', 'count')
            .addSelect('SUM(o.amount)', 'totalAmount')
            .addSelect('o.currency', 'currency')
            .groupBy('o.stage')
            .addGroupBy('o.currency')
            .orderBy('o.stage', 'ASC');

        if (assignedToId?.trim()) {
            qb.andWhere('o.assignedToId = :assignedToId', { assignedToId: assignedToId.trim() });
        }

        const pipeline = await qb.getRawMany();

        return {
            message: await this.i18nService.translate('opportunity.pipeline_retrieved', lang),
            data: pipeline,
        };
    }
}