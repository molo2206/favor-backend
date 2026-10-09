import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    // ⏱️ CALCUL DU SLA (deadline basée sur la priorité)
    // ============================================================
    private computeSlaDeadline(priority: TicketPriority): Date {
        const now = new Date();
        const minutesMap: Record<TicketPriority, number> = {
            [TicketPriority.CRITICAL]: 120,   // 2h
            [TicketPriority.URGENT]: 240,     // 4h
            [TicketPriority.HIGH]: 480,       // 8h
            [TicketPriority.NORMAL]: 1440,    // 24h
            [TicketPriority.LOW]: 2880,       // 48h
        };
        const minutes = minutesMap[priority] ?? 1440;
        return new Date(now.getTime() + minutes * 60 * 1000);
    }

    // ============================================================
    // 🔒 VÉRIFIER UN AGENT (ADMIN ou SUPER_ADMIN)
    // ============================================================
    private async validateAgent(
        agentId: string,
        lang: string = 'fr',
    ): Promise<UserEntity> {
        const agent = await this.userRepo.findOne({
            where: { id: agentId },
        });

        if (!agent) {
            throw new NotFoundException(
                await this.i18nService.translate('ticket.agent_not_found', lang, {
                    id: agentId,
                }),
            );
        }

        const allowedRoles = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
        if (!allowedRoles.includes(agent.role)) {
            throw new BadRequestException(
                await this.i18nService.translate('ticket.agent_invalid_role', lang, {
                    role: agent.role,
                }),
            );
        }

        if (!agent.isActive) {
            throw new BadRequestException(
                await this.i18nService.translate('ticket.agent_inactive', lang, {
                    name: agent.fullName,
                }),
            );
        }

        if (agent.deleted) {
            throw new BadRequestException(
                await this.i18nService.translate('ticket.agent_deleted', lang, {
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
        const customer = await this.userRepo.findOne({
            where: { id: customerId },
        });

        if (!customer) {
            throw new NotFoundException(
                await this.i18nService.translate('ticket.customer_not_found', lang, {
                    id: customerId,
                }),
            );
        }

        return customer;
    }

    // ============================================================
    // ➕ CRÉER UN TICKET
    // ============================================================
    async create(
        dto: CreateTicketDto,
        lang: string = 'fr',
    ): Promise<{ message: string; data: TicketEntity }> {
        // 1. Le sujet est obligatoire
        if (!dto.subject || dto.subject.trim() === '') {
            throw new BadRequestException(
                await this.i18nService.translate('ticket.subject_required', lang),
            );
        }

        // 2. Valeurs par défaut
        const priority = dto.priority || TicketPriority.NORMAL;
        const category = dto.category || TicketCategory.OTHER;

        // 3. Vérifier le client (si fourni)
        if (dto.customerId) {
            await this.validateCustomer(dto.customerId, lang);
        }

        // 4. Vérifier l'agent (si fourni)
        if (dto.assignedToId) {
            await this.validateAgent(dto.assignedToId, lang);
        }

        // 5. SLA deadline
        const slaDeadline = this.computeSlaDeadline(priority);

        // 6. Création
        const ticket = this.ticketRepo.create({
            ...dto,
            subject: dto.subject.trim(),
            description: dto.description?.trim(),
            ticketNumber: this.generateNumber(),
            status: dto.assignedToId ? TicketStatus.ASSIGNED : TicketStatus.NEW,
            priority,
            category,
            slaDeadline,
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
    // 📋 LISTER LES TICKETS
    // ============================================================
    async findAll(
        status?: TicketStatus,
        priority?: string,
        category?: string,
        customerId?: string,
        assignedToId?: string,
        page: number = 1,
        limit: number = 10,
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<TicketEntity>;
    }> {
        const query = this.ticketRepo
            .createQueryBuilder('t')
            .leftJoinAndSelect('t.customer', 'customer')
            .leftJoinAndSelect('t.assignedTo', 'assignedTo')
            .leftJoinAndSelect('t.order', 'order')
            .leftJoinAndSelect('t.shipment', 'shipment')
            .orderBy('t.createdAt', 'DESC');

        if (status) query.andWhere('t.status = :status', { status });
        if (priority?.trim()) query.andWhere('t.priority = :priority', { priority: priority.trim() });
        if (category?.trim()) query.andWhere('t.category = :category', { category: category.trim() });
        if (customerId?.trim()) query.andWhere('t.customerId = :customerId', { customerId: customerId.trim() });
        if (assignedToId?.trim()) query.andWhere('t.assignedToId = :assignedToId', { assignedToId: assignedToId.trim() });

        // Pagination
        const currentPage = Math.max(1, Number(page) || 1);
        const currentLimit = Math.max(1, Number(limit) || 10);
        const skip = (currentPage - 1) * currentLimit;

        query.skip(skip).take(currentLimit);

        const [tickets, total] = await query.getManyAndCount();

        if (!tickets.length) {
            throw new NotFoundException(
                await this.i18nService.translate('ticket.not_found', lang),
            );
        }

        return {
            message: await this.i18nService.translate('ticket.list_retrieved', lang),
            data: new PaginatedResponseDto(
                tickets,
                total,
                currentPage,
                currentLimit,
            ),
        };
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
        lang: string = 'fr',
    ): Promise<{ message: string; data: TicketEntity }> {
        const { data: ticket } = await this.findOne(id, lang);

        // ============================================================
        // 1️⃣ VALIDATIONS DTO
        // ============================================================
        if (dto.subject !== undefined && (!dto.subject || dto.subject.trim() === '')) {
            throw new BadRequestException(
                await this.i18nService.translate('ticket.subject_required', lang),
            );
        }

        // ============================================================
        // 2️⃣ VÉRIFIER LE NOUVEAU CLIENT (si changé)
        // ============================================================
        if (dto.customerId && dto.customerId !== ticket.customerId) {
            await this.validateCustomer(dto.customerId, lang);
        }

        // ============================================================
        // 3️⃣ VÉRIFIER LE NOUVEL AGENT (si changé)
        // ============================================================
        if (dto.assignedToId && dto.assignedToId !== ticket.assignedToId) {
            await this.validateAgent(dto.assignedToId, lang);
        }

        // ============================================================
        // 4️⃣ GESTION DES DATES AUTOMATIQUES SELON LE STATUT
        // ============================================================
        if (dto.status) {
            // 🔹 Première réponse
            if (
                !ticket.firstResponseAt &&
                (dto.status === TicketStatus.IN_PROGRESS ||
                    dto.status === TicketStatus.WAITING_CUSTOMER ||
                    dto.status === TicketStatus.RESOLVED ||
                    dto.status === TicketStatus.CLOSED)
            ) {
                ticket.firstResponseAt = new Date();
            }

            // 🔹 Résolu
            if (dto.status === TicketStatus.RESOLVED && !ticket.resolvedAt) {
                ticket.resolvedAt = new Date();
            }

            // 🔹 Fermé
            if (dto.status === TicketStatus.CLOSED && !ticket.closedAt) {
                ticket.closedAt = new Date();
            }

            // 🔹 Vérifier le SLA (si pas encore dépassé)
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

        // ============================================================
        // 5️⃣ APPLIQUER LES MODIFICATIONS
        // ============================================================
        Object.assign(ticket, {
            ...dto,
            ...(dto.subject !== undefined && { subject: dto.subject.trim() }),
            ...(dto.description !== undefined && {
                description: dto.description?.trim(),
            }),
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
    // 👤 ASSIGNER UN TICKET
    // ============================================================
    async assign(
        id: string,
        assignedToId: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: TicketEntity }> {
        const { data: ticket } = await this.findOne(id, lang);

        const agent = await this.validateAgent(assignedToId, lang);

        ticket.assignedToId = assignedToId;
        ticket.status = TicketStatus.ASSIGNED;

        const updatedTicket = await this.ticketRepo.save(ticket);

        return {
            message: await this.i18nService.translate('ticket.assigned_success', lang, {
                ticketNumber: updatedTicket.ticketNumber,
                agentName: agent.fullName,
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