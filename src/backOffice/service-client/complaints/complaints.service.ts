import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { ComplaintEntity, ComplaintStatus } from './entities/complaint.entity';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { ComplaintLevel } from '../common/enums/complaint-level.enum';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { I18nService } from 'src/libs/common/src';
import { ComplaintQueryDto } from './dto/complaint-query.dto';
import { endOf, pageParams, startOf } from '../common/list-query';

@Injectable()
export class ComplaintsService {
    constructor(
        @InjectRepository(ComplaintEntity)
        private readonly complaintRepo: Repository<ComplaintEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepo: Repository<UserEntity>,

        private readonly i18nService: I18nService,
    ) { }

    // ============================================================
    // 🔢 GÉNÉRATION DU NUMÉRO DE RÉCLAMATION
    // ============================================================
    private generateNumber(): string {
        const year = new Date().getFullYear();
        const random = Math.floor(1000 + Math.random() * 9000);
        return `CMP-${year}-${random}`;
    }

    // ============================================================
    // 🔒 VÉRIFIER UN AGENT (ADMIN ou SUPER_ADMIN)
    // ============================================================
    private async validateAgent(
        agentId: string,
        lang: string = 'fr',
    ): Promise<UserEntity> {
        const agent = await this.userRepo.findOne({ where: { id: agentId } });

        if (!agent) {
            throw new NotFoundException(
                await this.i18nService.translate('complaint.agent_not_found', lang, {
                    id: agentId,
                }),
            );
        }

        const allowedRoles = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
        if (!allowedRoles.includes(agent.role)) {
            throw new BadRequestException(
                await this.i18nService.translate('complaint.agent_invalid_role', lang, {
                    role: agent.role,
                }),
            );
        }

        if (!agent.isActive) {
            throw new BadRequestException(
                await this.i18nService.translate('complaint.agent_inactive', lang, {
                    name: agent.fullName,
                }),
            );
        }

        if (agent.deleted) {
            throw new BadRequestException(
                await this.i18nService.translate('complaint.agent_deleted', lang, {
                    name: agent.fullName,
                }),
            );
        }

        return agent;
    }

    // ============================================================
    // 🔒 VÉRIFIER UN CLIENT
    // ============================================================
    private async validateCustomer(
        customerId: string,
        lang: string = 'fr',
    ): Promise<UserEntity> {
        const customer = await this.userRepo.findOne({ where: { id: customerId } });

        if (!customer) {
            throw new NotFoundException(
                await this.i18nService.translate('complaint.customer_not_found', lang, {
                    id: customerId,
                }),
            );
        }

        return customer;
    }

    // ============================================================
    // ➕ CRÉER UNE RÉCLAMATION
    // ============================================================
    async create(
        dto: CreateComplaintDto,
        lang: string = 'fr',
        currentUserId?: string | null,
    ): Promise<{ message: string; data: ComplaintEntity }> {
        // 1. Validations de base
        if (!dto.subject || dto.subject.trim() === '') {
            throw new BadRequestException(
                await this.i18nService.translate('complaint.subject_required', lang),
            );
        }

        if (!dto.description || dto.description.trim() === '') {
            throw new BadRequestException(
                await this.i18nService.translate('complaint.description_required', lang),
            );
        }

        // 2. Valeur par défaut du niveau
        const level = dto.level || ComplaintLevel.NORMAL;

        // 3. Vérifier le client (si fourni dans le dto)
        if (dto.customerId) {
            await this.validateCustomer(dto.customerId, lang);
        }

        // ✅ 4. Déterminer l'agent :
        //    → si dto.agentId est fourni et non vide → on l'utilise
        //    → sinon → le user connecté devient l'agent
        const agentId: string | undefined =
            dto.agentId && dto.agentId.trim() !== ''
                ? dto.agentId.trim()
                : (currentUserId ?? undefined);

        // 5. Valider l'agent uniquement s'il est différent du user connecté
        if (agentId && agentId !== currentUserId) {
            await this.validateAgent(agentId, lang);
        }

        // 6. Création
        const complaint = this.complaintRepo.create({
            subject: dto.subject.trim(),
            description: dto.description.trim(),
            level,
            number: this.generateNumber(),
            status: ComplaintStatus.OPEN,
            customerId: dto.customerId,   // ✅ inchangé (vient du dto)
            agentId,                       // ✅ auto-assigné si vide
        });

        const saved = await this.complaintRepo.save(complaint as ComplaintEntity);

        return {
            message: await this.i18nService.translate(
                'complaint.created_success',
                lang,
                { number: saved.number },
            ),
            data: saved,
        };
    }

    // ============================================================
    // 📋 LISTES DES RÉCLAMATIONS (filtres + pagination PaginatedResponseDto)
    // ============================================================

    /** Filtres communs (alias c, client customer) — `skipStatus` pour les compteurs par statut */
    private applyComplaintFilters(qb: SelectQueryBuilder<ComplaintEntity>, q: ComplaintQueryDto, skipStatus = false) {
        if (!skipStatus && q.status?.length) qb.andWhere('c.status IN (:...status)', { status: q.status });
        if (q.level?.length) qb.andWhere('c.level IN (:...level)', { level: q.level });
        if (q.customerId) qb.andWhere('c.customerId = :customerId', { customerId: q.customerId });
        if (q.agentId) qb.andWhere('c.agentId = :agentId', { agentId: q.agentId });
        if (q.unassigned === 'true') qb.andWhere('c.agentId IS NULL');
        if (q.unassigned === 'false') qb.andWhere('c.agentId IS NOT NULL');
        const closed = [ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED];
        if (q.open === 'true') qb.andWhere('c.status NOT IN (:...closedO)', { closedO: closed });
        if (q.open === 'false') qb.andWhere('c.status IN (:...closedC)', { closedC: closed });
        if (q.hasCorrectiveAction === 'true') qb.andWhere("c.correctiveAction IS NOT NULL AND c.correctiveAction <> ''");
        if (q.hasCorrectiveAction === 'false') qb.andWhere("(c.correctiveAction IS NULL OR c.correctiveAction = '')");
        if (q.hasAttachments === 'true') qb.andWhere("c.attachments IS NOT NULL AND JSON_LENGTH(c.attachments) > 0");
        if (q.hasAttachments === 'false') qb.andWhere("(c.attachments IS NULL OR JSON_LENGTH(c.attachments) = 0)");
        if (q.from) qb.andWhere('c.createdAt >= :from', { from: startOf(q.from) });
        if (q.to) qb.andWhere('c.createdAt <= :to', { to: endOf(q.to) });
        if (q.search) {
            const s = `%${q.search}%`;
            qb.andWhere(
                new Brackets((w) =>
                    w
                        .where('c.number LIKE :s', { s })
                        .orWhere('c.subject LIKE :s', { s })
                        .orWhere('c.description LIKE :s', { s })
                        .orWhere('customer.fullName LIKE :s', { s })
                        .orWhere('customer.phone LIKE :s', { s })
                        .orWhere('customer.email LIKE :s', { s }),
                ),
            );
        }
        return qb;
    }

    private async listComplaints(q: ComplaintQueryDto, lang: string, opts: { onlyCustomerId?: string; message: string; emptyMessage: string }) {
        const { page, limit } = pageParams(q.page, q.limit);
        const order = q.sortOrder === 'ASC' ? 'ASC' : 'DESC';
        const query = this.complaintRepo
            .createQueryBuilder('c')
            .leftJoinAndSelect('c.customer', 'customer')
            .leftJoinAndSelect('c.agent', 'agent');
        if (opts.onlyCustomerId) query.andWhere('c.customerId = :me', { me: opts.onlyCustomerId });
        this.applyComplaintFilters(query, q);

        // Tri (jointures ManyToOne : offset / limit, sans doublons)
        switch (q.sortBy) {
            case 'level':
                query.orderBy("FIELD(c.level, 'LOW', 'NORMAL', 'IMPORTANT', 'URGENT', 'CRITICAL')", order);
                break;
            case 'status':
                query.orderBy("FIELD(c.status, 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')", order);
                break;
            case 'updatedAt':
            case 'number':
                query.orderBy(`c.${q.sortBy}`, order);
                break;
            default:
                query.orderBy('c.createdAt', order);
        }
        query.addOrderBy('c.id', 'ASC').offset((page - 1) * limit).limit(limit);
        const [complaints, total] = await query.getManyAndCount();

        // Compteurs par statut (mêmes filtres, sans le filtre de statut)
        const sq = this.complaintRepo
            .createQueryBuilder('c')
            .leftJoin('c.customer', 'customer')
            .select('c.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .groupBy('c.status');
        if (opts.onlyCustomerId) sq.andWhere('c.customerId = :me', { me: opts.onlyCustomerId });
        this.applyComplaintFilters(sq, q, true);
        const rows: { status: string; count: string }[] = await sq.getRawMany();
        const byStatus: Record<string, number> = Object.fromEntries(Object.values(ComplaintStatus).map((s) => [s, 0]));
        for (const r of rows) byStatus[r.status] = Number(r.count);

        // ✅ Liste vide = page vide (plus d'erreur 404)
        return {
            message: await this.i18nService.translate(total > 0 ? opts.message : opts.emptyMessage, lang),
            data: new PaginatedResponseDto<ComplaintEntity>(complaints, total, page, limit),
            summary: { byStatus, all: Object.values(byStatus).reduce((a, b) => a + b, 0) },
        };
    }

    /** ✅ Mes réclamations (client connecté), mêmes filtres */
    async findMyComplaints(
        userId: string,
        q: ComplaintQueryDto,
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<ComplaintEntity>;
        summary: { byStatus: Record<string, number>; all: number };
    }> {
        await this.validateCustomer(userId, lang);
        const { customerId: _ignored, ...rest } = q;
        return this.listComplaints(rest as ComplaintQueryDto, lang, {
            onlyCustomerId: userId,
            message: 'complaint.my_list_retrieved',
            emptyMessage: 'complaint.my_not_found',
        });
    }

    async findAll(
        q: ComplaintQueryDto,
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<ComplaintEntity>;
        summary: { byStatus: Record<string, number>; all: number };
    }> {
        return this.listComplaints(q, lang, { message: 'complaint.list_retrieved', emptyMessage: 'complaint.not_found' });
    }

    // ============================================================
    // 🔍 VOIR UNE RÉCLAMATION
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ComplaintEntity }> {
        const c = await this.complaintRepo.findOne({
            where: { id },
            relations: ['customer', 'agent'],
        });

        if (!c) {
            throw new NotFoundException(
                await this.i18nService.translate('complaint.not_found_by_id', lang, { id }),
            );
        }

        return {
            message: await this.i18nService.translate('complaint.found_success', lang, {
                number: c.number,
            }),
            data: c,
        };
    }

    // ============================================================
    // ✏️ MODIFIER UNE RÉCLAMATION
    // ============================================================
    async update(
        id: string,
        dto: UpdateComplaintDto,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ComplaintEntity }> {
        const { data: c } = await this.findOne(id, lang);

        // 1. Validation sujet
        if (dto.subject !== undefined && (!dto.subject || dto.subject.trim() === '')) {
            throw new BadRequestException(
                await this.i18nService.translate('complaint.subject_required', lang),
            );
        }

        // 2. Validation description
        if (dto.description !== undefined && (!dto.description || dto.description.trim() === '')) {
            throw new BadRequestException(
                await this.i18nService.translate('complaint.description_required', lang),
            );
        }

        // 3. Vérifier le nouveau client (si changé)
        if (dto.customerId && dto.customerId !== c.customerId) {
            await this.validateCustomer(dto.customerId, lang);
        }

        // 4. Vérifier le nouvel agent (si changé)
        if (dto.agentId && dto.agentId !== c.agentId) {
            await this.validateAgent(dto.agentId, lang);
        }

        // 5. Appliquer les modifs
        Object.assign(c, {
            ...dto,
            ...(dto.subject !== undefined && { subject: dto.subject.trim() }),
            ...(dto.description !== undefined && { description: dto.description.trim() }),
        });

        const updated = await this.complaintRepo.save(c);

        return {
            message: await this.i18nService.translate('complaint.updated_success', lang, {
                number: updated.number,
            }),
            data: updated,
        };
    }

    // ============================================================
    // 👤 ASSIGNER UNE RÉCLAMATION
    // ============================================================
    async assign(
        id: string,
        agentId: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ComplaintEntity }> {
        const { data: c } = await this.findOne(id, lang);

        const agent = await this.validateAgent(agentId, lang);

        c.agentId = agentId;
        c.status = ComplaintStatus.IN_PROGRESS;

        const updated = await this.complaintRepo.save(c);

        return {
            message: await this.i18nService.translate('complaint.assigned_success', lang, {
                number: updated.number,
                agentName: agent.fullName,
            }),
            data: updated,
        };
    }

    // ============================================================
    // 🗑️ SUPPRIMER UNE RÉCLAMATION
    // ============================================================
    async remove(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string }> {
        const { data: c } = await this.findOne(id, lang);
        await this.complaintRepo.remove(c);

        return {
            message: await this.i18nService.translate('complaint.deleted_success', lang, {
                number: c.number,
            }),
        };
    }
}