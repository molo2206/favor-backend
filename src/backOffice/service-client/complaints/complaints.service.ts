import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplaintEntity, ComplaintStatus } from './entities/complaint.entity';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { ComplaintLevel } from '../common/enums/complaint-level.enum';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { I18nService } from 'src/libs/common/src';

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

        // 2. Valeur par défaut
        const level = dto.level || ComplaintLevel.NORMAL;

        // 3. Vérifier le client (si fourni)
        if (dto.customerId) {
            await this.validateCustomer(dto.customerId, lang);
        }

        // 4. Vérifier l'agent (si fourni)
        if (dto.agentId) {
            await this.validateAgent(dto.agentId, lang);
        }

        // 5. Création
        const complaint = this.complaintRepo.create({
            ...dto,
            subject: dto.subject.trim(),
            description: dto.description.trim(),
            number: this.generateNumber(),
            level,
            status: ComplaintStatus.OPEN,
        });

        const saved = await this.complaintRepo.save(complaint);

        return {
            message: await this.i18nService.translate('complaint.created_success', lang, {
                number: saved.number,
            }),
            data: saved,
        };
    }

    // ============================================================
    // 📋 LISTER LES RÉCLAMATIONS
    // ============================================================
    async findAll(
        status?: ComplaintStatus,
        level?: string,
        customerId?: string,
        agentId?: string,
        page: number = 1,
        limit: number = 10,
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<ComplaintEntity>;
    }> {
        const query = this.complaintRepo
            .createQueryBuilder('c')
            .leftJoinAndSelect('c.customer', 'customer')
            .leftJoinAndSelect('c.agent', 'agent')
            .orderBy('c.createdAt', 'DESC');

        if (status) query.andWhere('c.status = :status', { status });
        if (level?.trim()) query.andWhere('c.level = :level', { level: level.trim() });
        if (customerId?.trim()) query.andWhere('c.customerId = :customerId', { customerId: customerId.trim() });
        if (agentId?.trim()) query.andWhere('c.agentId = :agentId', { agentId: agentId.trim() });

        // Pagination
        const currentPage = Math.max(1, Number(page) || 1);
        const currentLimit = Math.max(1, Number(limit) || 10);
        const skip = (currentPage - 1) * currentLimit;

        query.skip(skip).take(currentLimit);

        const [complaints, total] = await query.getManyAndCount();

        if (!complaints.length) {
            throw new NotFoundException(
                await this.i18nService.translate('complaint.not_found', lang),
            );
        }

        return {
            message: await this.i18nService.translate('complaint.list_retrieved', lang),
            data: new PaginatedResponseDto(complaints, total, currentPage, currentLimit),
        };
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