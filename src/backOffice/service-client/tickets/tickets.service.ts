import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { TicketEntity } from './entities/ticket.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketCategory } from '../common/enums/ticket-category.enum';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { I18nService } from 'src/libs/common/src';
import { TicketQueryDto } from './dto/ticket-query.dto';
import { endOf, pageParams, startOf } from '../common/list-query';

@Injectable()
export class TicketsService {
    constructor(
        @InjectRepository(TicketEntity)
        private readonly ticketRepo: Repository<TicketEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepo: Repository<UserEntity>,

        private readonly i18nService: I18nService,
    ) { }

    // ============================================================
    // 🔢 GÉNÉRATION DU NUMÉRO DE TICKET
    // ============================================================
    private generateNumber(): string {
        const year = new Date().getFullYear();
        const random = Math.floor(100000 + Math.random() * 900000);
        return `TCK-${year}-${random}`;
    }

    // ============================================================
    // ⏱️ CALCUL DU SLA
    // ============================================================
    private computeSlaDeadline(priority: TicketPriority): Date {
        const now = new Date();
        const minutesMap: Record<TicketPriority, number> = {
            [TicketPriority.CRITICAL]: 120,
            [TicketPriority.URGENT]: 240,
            [TicketPriority.HIGH]: 480,
            [TicketPriority.NORMAL]: 1440,
            [TicketPriority.LOW]: 2880,
        };
        const minutes = minutesMap[priority] ?? 1440;
        return new Date(now.getTime() + minutes * 60 * 1000);
    }

    // ============================================================
    // 🔒 VÉRIFIER UN AGENT
    // ============================================================
    private async validateAgent(
        agentId: string,
        lang: string = 'fr',
    ): Promise<UserEntity> {
        const agent = await this.userRepo.findOne({ where: { id: agentId } });

        if (!agent) {
            throw new NotFoundException(
                await this.i18nService.translate('ticket.agent_not_found', lang, { id: agentId }),
            );
        }

        const allowedRoles = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
        if (!allowedRoles.includes(agent.role)) {
            throw new BadRequestException(
                await this.i18nService.translate('ticket.agent_invalid_role', lang, { role: agent.role }),
            );
        }

        if (!agent.isActive) {
            throw new BadRequestException(
                await this.i18nService.translate('ticket.agent_inactive', lang, { name: agent.fullName }),
            );
        }

        if (agent.deleted) {
            throw new BadRequestException(
                await this.i18nService.translate('ticket.agent_deleted', lang, { name: agent.fullName }),
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
                await this.i18nService.translate('ticket.customer_not_found', lang, { id: customerId }),
            );
        }

        return customer;
    }

    // ============================================================
    // ➕ CRÉER UN TICKET (avec auto-assign si assignedToId vide)
    // ============================================================
    async create(
        dto: CreateTicketDto,
        user: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: TicketEntity }> {
        // 1. Sujet obligatoire
        if (!dto.subject || dto.subject.trim() === '') {
            throw new BadRequestException(
                await this.i18nService.translate('ticket.subject_required', lang),
            );
        }

        // 2. Valeurs par défaut
        const priority = dto.priority || TicketPriority.NORMAL;
        const category = dto.category || TicketCategory.OTHER;

        // 3. 🔥 Résoudre assignedToId : fourni OU user connecté
        const resolvedAssignedToId = dto.assignedToId?.trim() || user.id;

        // 4. Vérifier le client (si fourni)
        if (dto.customerId) {
            await this.validateCustomer(dto.customerId, lang);
        }

        // 5. Vérifier l'agent SEULEMENT si explicitement fourni
        //    (le user connecté peut ne pas être ADMIN/SUPER_ADMIN)
        if (dto.assignedToId && dto.assignedToId.trim() !== '') {
            await this.validateAgent(dto.assignedToId.trim(), lang);
        }

        // 6. SLA
        const slaDeadline = this.computeSlaDeadline(priority);

        // 7. Création
        const ticket = this.ticketRepo.create({
            ...dto,
            subject: dto.subject.trim(),
            description: dto.description?.trim(),
            ticketNumber: this.generateNumber(),
            status: resolvedAssignedToId ? TicketStatus.ASSIGNED : TicketStatus.NEW,
            priority,
            category,
            slaDeadline,
            assignedToId: resolvedAssignedToId,
        });

        const savedTicket = await this.ticketRepo.save(ticket);

        return {
            message: await this.i18nService.translate('ticket.created_success', lang, {
                ticketNumber: savedTicket.ticketNumber,
            }),
            data: savedTicket,
        };
    }

    // ============================================================
    // 📋 LISTER LES TICKETS (filtres + pagination PaginatedResponseDto)
    // ============================================================

    /** Filtres communs (alias t, client customer) — `skipStatus` pour les compteurs par statut */
    private applyTicketFilters(qb: SelectQueryBuilder<TicketEntity>, q: TicketQueryDto, skipStatus = false) {
        if (!skipStatus && q.status?.length) qb.andWhere('t.status IN (:...status)', { status: q.status });
        if (q.priority?.length) qb.andWhere('t.priority IN (:...priority)', { priority: q.priority });
        if (q.category?.length) qb.andWhere('t.category IN (:...category)', { category: q.category });
        if (q.customerId) qb.andWhere('t.customerId = :customerId', { customerId: q.customerId });
        if (q.assignedToId) qb.andWhere('t.assignedToId = :assignedToId', { assignedToId: q.assignedToId });
        if (q.unassigned === 'true') qb.andWhere('t.assignedToId IS NULL');
        if (q.unassigned === 'false') qb.andWhere('t.assignedToId IS NOT NULL');
        if (q.orderId) qb.andWhere('t.orderId = :orderId', { orderId: q.orderId });
        if (q.shipmentId) qb.andWhere('t.shipmentId = :shipmentId', { shipmentId: q.shipmentId });
        if (q.slaBreached === 'true') qb.andWhere('t.slaBreached = 1');
        if (q.slaBreached === 'false') qb.andWhere('t.slaBreached = 0');
        const closed = [TicketStatus.RESOLVED, TicketStatus.CLOSED];
        if (q.overdue === 'true') {
            qb.andWhere('t.slaDeadline IS NOT NULL AND t.slaDeadline < :now AND t.status NOT IN (:...closedOd)', { now: new Date(), closedOd: closed });
        }
        if (q.overdue === 'false') {
            qb.andWhere('(t.slaDeadline IS NULL OR t.slaDeadline >= :now2 OR t.status IN (:...closedOd2))', { now2: new Date(), closedOd2: closed });
        }
        if (q.open === 'true') qb.andWhere('t.status NOT IN (:...closedO)', { closedO: closed });
        if (q.open === 'false') qb.andWhere('t.status IN (:...closedC)', { closedC: closed });
        if (q.noResponse === 'true') qb.andWhere('t.firstResponseAt IS NULL');
        if (q.noResponse === 'false') qb.andWhere('t.firstResponseAt IS NOT NULL');
        if (q.from) qb.andWhere('t.createdAt >= :from', { from: startOf(q.from) });
        if (q.to) qb.andWhere('t.createdAt <= :to', { to: endOf(q.to) });
        if (q.resolvedFrom) qb.andWhere('t.resolvedAt >= :resolvedFrom', { resolvedFrom: startOf(q.resolvedFrom) });
        if (q.resolvedTo) qb.andWhere('t.resolvedAt <= :resolvedTo', { resolvedTo: endOf(q.resolvedTo) });
        if (q.search) {
            const s = `%${q.search}%`;
            qb.andWhere(
                new Brackets((w) =>
                    w
                        .where('t.ticketNumber LIKE :s', { s })
                        .orWhere('t.subject LIKE :s', { s })
                        .orWhere('t.description LIKE :s', { s })
                        .orWhere('customer.fullName LIKE :s', { s })
                        .orWhere('customer.phone LIKE :s', { s })
                        .orWhere('customer.email LIKE :s', { s }),
                ),
            );
        }
        return qb;
    }

    private async listTickets(q: TicketQueryDto, lang: string, opts: { onlyCustomerId?: string; message: string; emptyMessage: string }) {
        const { page, limit } = pageParams(q.page, q.limit);
        const order = q.sortOrder === 'ASC' ? 'ASC' : 'DESC';
        const query = this.ticketRepo
            .createQueryBuilder('t')
            .leftJoinAndSelect('t.customer', 'customer')
            .leftJoinAndSelect('t.assignedTo', 'assignedTo')
            .leftJoinAndSelect('t.order', 'order')
            .leftJoinAndSelect('t.shipment', 'shipment');
        if (opts.onlyCustomerId) query.andWhere('t.customerId = :me', { me: opts.onlyCustomerId });
        this.applyTicketFilters(query, q);

        // Tri (les jointures sont ManyToOne : offset / limit, sans doublons)
        switch (q.sortBy) {
            case 'priority':
                query.orderBy("FIELD(t.priority, 'LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL')", order);
                break;
            case 'status':
                query.orderBy("FIELD(t.status, 'NEW', 'REOPENED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED')", order);
                break;
            case 'slaDeadline':
                query.orderBy('CASE WHEN t.slaDeadline IS NULL THEN 1 ELSE 0 END', 'ASC').addOrderBy('t.slaDeadline', order);
                break;
            case 'updatedAt':
            case 'ticketNumber':
            case 'resolvedAt':
                query.orderBy(`t.${q.sortBy}`, order);
                break;
            default:
                query.orderBy('t.createdAt', order);
        }
        query.addOrderBy('t.id', 'ASC').offset((page - 1) * limit).limit(limit);
        const [tickets, total] = await query.getManyAndCount();

        // Compteurs par statut (mêmes filtres, sans le filtre de statut) : badges des onglets
        const sq = this.ticketRepo
            .createQueryBuilder('t')
            .leftJoin('t.customer', 'customer')
            .select('t.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .groupBy('t.status');
        if (opts.onlyCustomerId) sq.andWhere('t.customerId = :me', { me: opts.onlyCustomerId });
        this.applyTicketFilters(sq, q, true);
        const rows: { status: string; count: string }[] = await sq.getRawMany();
        const byStatus: Record<string, number> = Object.fromEntries(Object.values(TicketStatus).map((s) => [s, 0]));
        for (const r of rows) byStatus[r.status] = Number(r.count);

        return {
            message: await this.i18nService.translate(total > 0 ? opts.message : opts.emptyMessage, lang),
            data: new PaginatedResponseDto<TicketEntity>(tickets, total, page, limit),
            summary: { byStatus, all: Object.values(byStatus).reduce((a, b) => a + b, 0) },
        };
    }

    async findAll(
        q: TicketQueryDto,
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<TicketEntity>;
        summary: { byStatus: Record<string, number>; all: number };
    }> {
        return this.listTickets(q, lang, { message: 'ticket.list_retrieved', emptyMessage: 'ticket.not_found' });
    }

    /** ✅ Mes tickets (client connecté), mêmes filtres */
    async findMine(
        userId: string,
        q: TicketQueryDto,
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<TicketEntity>;
        summary: { byStatus: Record<string, number>; all: number };
    }> {
        const { customerId: _ignored, ...rest } = q;
        return this.listTickets(rest as TicketQueryDto, lang, { onlyCustomerId: userId, message: 'ticket.list_retrieved', emptyMessage: 'ticket.not_found' });
    }

    // ============================================================
    // 🔍 VOIR UN TICKET
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: TicketEntity }> {
        const ticket = await this.ticketRepo.findOne({
            where: { id },
            relations: ['customer', 'assignedTo', 'order', 'shipment'],
        });
        if (!ticket) {
            throw new NotFoundException(
                await this.i18nService.translate('ticket.not_found_by_id', lang, { id }),
            );
        }

        return {
            message: await this.i18nService.translate('ticket.found_success', lang, {
                ticketNumber: ticket.ticketNumber,
            }),
            data: ticket,
        };
    }

    // ============================================================
    // ✏️ MODIFIER UN TICKET
    // ============================================================
    async update(
        id: string,
        dto: UpdateTicketDto,
        user: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: TicketEntity }> {
        const { data: ticket } = await this.findOne(id, lang);

        // 1️⃣ Validation sujet
        if (dto.subject !== undefined && (!dto.subject || dto.subject.trim() === '')) {
            throw new BadRequestException(
                await this.i18nService.translate('ticket.subject_required', lang),
            );
        }

        // 2️⃣ Vérifier le client si changé
        if (dto.customerId && dto.customerId !== ticket.customerId) {
            await this.validateCustomer(dto.customerId, lang);
        }

        // 3️⃣ 🔥 Résoudre assignedToId : vide → user connecté
        if (dto.assignedToId !== undefined) {
            const resolved = dto.assignedToId?.trim() || user.id;
            if (resolved !== ticket.assignedToId && dto.assignedToId?.trim()) {
                await this.validateAgent(dto.assignedToId.trim(), lang);
            }
            dto.assignedToId = resolved;
        }

        // 4️⃣ Dates automatiques selon le statut
        if (dto.status) {
            if (
                !ticket.firstResponseAt &&
                (dto.status === TicketStatus.IN_PROGRESS ||
                    dto.status === TicketStatus.WAITING_CUSTOMER ||
                    dto.status === TicketStatus.RESOLVED ||
                    dto.status === TicketStatus.CLOSED)
            ) {
                ticket.firstResponseAt = new Date();
            }

            if (dto.status === TicketStatus.RESOLVED && !ticket.resolvedAt) {
                ticket.resolvedAt = new Date();
            }

            if (dto.status === TicketStatus.CLOSED && !ticket.closedAt) {
                ticket.closedAt = new Date();
            }

            if (ticket.slaDeadline && !ticket.slaBreached) {
                const now = new Date();
                if (
                    now > ticket.slaDeadline &&
                    dto.status !== TicketStatus.RESOLVED &&
                    dto.status !== TicketStatus.CLOSED
                ) {
                    ticket.slaBreached = true;
                }
            }
        }

        // 5️⃣ Appliquer
        Object.assign(ticket, {
            ...dto,
            ...(dto.subject !== undefined && { subject: dto.subject.trim() }),
            ...(dto.description !== undefined && { description: dto.description?.trim() }),
        });

        const updatedTicket = await this.ticketRepo.save(ticket);

        return {
            message: await this.i18nService.translate('ticket.updated_success', lang, {
                ticketNumber: updatedTicket.ticketNumber,
            }),
            data: updatedTicket,
        };
    }

    // ============================================================
    // 👤 ASSIGNER UN TICKET (with auto-assign fallback)
    // ============================================================
    async assign(
        id: string,
        assignedToId: string | undefined,
        user: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: TicketEntity }> {
        const { data: ticket } = await this.findOne(id, lang);

        // 🔥 Si assignedToId est vide → user connecté
        const resolvedId = assignedToId?.trim() || user.id;

        // Valider seulement si explicitement fourni
        let agentName = user.fullName;
        if (assignedToId?.trim()) {
            const agent = await this.validateAgent(resolvedId, lang);
            agentName = agent.fullName;
        }

        ticket.assignedToId = resolvedId;
        ticket.status = TicketStatus.ASSIGNED;

        const updatedTicket = await this.ticketRepo.save(ticket);

        return {
            message: await this.i18nService.translate('ticket.assigned_success', lang, {
                ticketNumber: updatedTicket.ticketNumber,
                agentName,
            }),
            data: updatedTicket,
        };
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN TICKET
    // ============================================================
    async remove(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string }> {
        const { data: ticket } = await this.findOne(id, lang);
        await this.ticketRepo.remove(ticket);

        return {
            message: await this.i18nService.translate('ticket.deleted_success', lang, {
                ticketNumber: ticket.ticketNumber,
            }),
        };
    }
}