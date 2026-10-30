import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractEntity } from './entities/contract.entity';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractStatus } from '../common/enums/contract-status.enum';
import { UserEntity } from 'src/users/entities/user.entity';
import { ProspectEntity } from '../prospects/entities/prospect.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { I18nService } from 'src/libs/common/src';
import { FilesService } from 'src/files/files.service';

/**
 * ✅ Relations complètes chargées pour le front.
 */
const FULL_RELATIONS = [
    // Customer (user)
    'customer',
    'customer.activeCompany',
    'customer.activeBranch',

    // Prospect
    'prospect',
    'prospect.company',
    'prospect.branch',
    'prospect.assignedTo',
    'prospect.assignedTo.activeCompany',
    'prospect.assignedTo.activeBranch',

    // Manager (user)
    'manager',
    'manager.activeCompany',
    'manager.activeBranch',

    // CreatedBy (user)
    'createdBy',
    'createdBy.activeCompany',
    'createdBy.activeBranch',

    // ApprovedBy (user)
    'approvedBy',
    'approvedBy.activeCompany',
    'approvedBy.activeBranch',
];

@Injectable()
export class ContractsService {
    constructor(
        @InjectRepository(ContractEntity)
        private readonly contractRepo: Repository<ContractEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepo: Repository<UserEntity>,

        @InjectRepository(ProspectEntity)
        private readonly prospectRepo: Repository<ProspectEntity>,

        private readonly i18nService: I18nService,
        private readonly filesService: FilesService,
    ) { }

    // ============================================================
    // 🔢 GÉNÉRATION DU NUMÉRO
    // ============================================================
    private generateNumber(): string {
        const year = new Date().getFullYear();
        const random = Math.floor(1000 + Math.random() * 9000);
        return `CTR-${year}-${random}`;
    }

    // ============================================================
    // 🔒 VALIDATIONS
    // ============================================================
    private async validateUser(
        userId: string,
        lang: string,
        label: string,
    ): Promise<UserEntity> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException(
                await this.i18nService.translate(`contract.${label}_not_found`, lang, {
                    id: userId,
                }),
            );
        }
        if (!user.isActive) {
            throw new BadRequestException(
                await this.i18nService.translate(`contract.${label}_inactive`, lang, {
                    name: user.fullName,
                }),
            );
        }
        return user;
    }

    private async validateProspect(
        prospectId: string,
        lang: string,
    ): Promise<ProspectEntity> {
        const p = await this.prospectRepo.findOne({ where: { id: prospectId } });
        if (!p) {
            throw new NotFoundException(
                await this.i18nService.translate('contract.prospect_not_found', lang, {
                    id: prospectId,
                }),
            );
        }
        return p;
    }

    // ============================================================
    // ➕ CRÉER
    // ============================================================
    async create(
        dto: CreateContractDto,
        lang: string = 'fr',
        file?: Express.Multer.File,
    ): Promise<{ message: string; data: ContractEntity }> {
        // 1. Validations de base
        if (!dto.type || dto.type.trim() === '') {
            throw new BadRequestException(
                await this.i18nService.translate('contract.type_required', lang),
            );
        }
        if (!dto.startDate) {
            throw new BadRequestException(
                await this.i18nService.translate('contract.start_date_required', lang),
            );
        }

        // 2. Client XOR prospect
        if (dto.customerId && dto.prospectId) {
            throw new BadRequestException(
                await this.i18nService.translate(
                    'contract.customer_and_prospect_exclusive',
                    lang,
                ),
            );
        }

        // 3. Dates
        const startDate = new Date(dto.startDate);
        const endDate = dto.endDate ? new Date(dto.endDate) : undefined;
        if (endDate && endDate <= startDate) {
            throw new BadRequestException(
                await this.i18nService.translate('contract.end_date_before_start', lang),
            );
        }

        // 4. Validations relations
        if (dto.customerId) await this.validateUser(dto.customerId, lang, 'customer');
        if (dto.prospectId) await this.validateProspect(dto.prospectId, lang);
        if (dto.managerId) await this.validateUser(dto.managerId, lang, 'manager');
        if (dto.createdById) await this.validateUser(dto.createdById, lang, 'created_by');
        if (dto.approvedById) await this.validateUser(dto.approvedById, lang, 'approved_by');

        // 5. Upload document
        let uploadedDocumentUrl: string | undefined;
        if (file) {
            try {
                const uploaded = await this.filesService.uploadFile(
                    file,
                    'contract',
                    'default',
                );
                uploadedDocumentUrl = uploaded.data;
                console.log('✅ [create-contract] Document uploadé:', uploadedDocumentUrl);
            } catch (err: any) {
                console.error('❌ [create-contract] Erreur upload:', err.message);
                throw new BadRequestException(
                    await this.i18nService.translate('contract.document_upload_failed', lang),
                );
            }
        }

        // 6. Création
        const contract = this.contractRepo.create({
            ...dto,
            type: dto.type.trim(),
            number: this.generateNumber(),
            startDate,
            endDate,
            status: dto.status || ContractStatus.DRAFT,
            company: dto.company?.trim() || undefined,
            documentUrl: uploadedDocumentUrl ?? dto.documentUrl?.trim() ?? undefined,
            approvedAt: dto.approvedAt ? new Date(dto.approvedAt) : undefined,
            signedAt: dto.signedAt ? new Date(dto.signedAt) : undefined,
        });

        const saved = await this.contractRepo.save(contract);

        const full = await this.contractRepo.findOne({
            where: { id: saved.id },
            relations: FULL_RELATIONS,
        });

        return {
            message: await this.i18nService.translate('contract.created_success', lang, {
                number: saved.number,
            }),
            data: full ?? saved,
        };
    }

    // ============================================================
    // 📋 LISTER
    // ============================================================
    async findAll(
        filters: {
            status?: string;
            customerId?: string;
            prospectId?: string;
            managerId?: string;
            company?: string;
            page?: number;
            limit?: number;
        },
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<ContractEntity>;
    }> {
        const query = this.contractRepo
            .createQueryBuilder('c')
            // ✅ Customer complet
            .leftJoinAndSelect('c.customer', 'customer')
            .leftJoinAndSelect('customer.activeCompany', 'customerActiveCompany')
            .leftJoinAndSelect('customer.activeBranch', 'customerActiveBranch')
            // ✅ Prospect complet
            .leftJoinAndSelect('c.prospect', 'prospect')
            .leftJoinAndSelect('prospect.company', 'prospectCompany')
            .leftJoinAndSelect('prospect.branch', 'prospectBranch')
            .leftJoinAndSelect('prospect.assignedTo', 'prospectAssignedTo')
            .leftJoinAndSelect('prospectAssignedTo.activeCompany', 'prospectAssignedToActiveCompany')
            .leftJoinAndSelect('prospectAssignedTo.activeBranch', 'prospectAssignedToActiveBranch')
            // ✅ Manager complet
            .leftJoinAndSelect('c.manager', 'manager')
            .leftJoinAndSelect('manager.activeCompany', 'managerActiveCompany')
            .leftJoinAndSelect('manager.activeBranch', 'managerActiveBranch')
            // ✅ CreatedBy complet
            .leftJoinAndSelect('c.createdBy', 'createdBy')
            .leftJoinAndSelect('createdBy.activeCompany', 'createdByActiveCompany')
            .leftJoinAndSelect('createdBy.activeBranch', 'createdByActiveBranch')
            // ✅ ApprovedBy complet
            .leftJoinAndSelect('c.approvedBy', 'approvedBy')
            .leftJoinAndSelect('approvedBy.activeCompany', 'approvedByActiveCompany')
            .leftJoinAndSelect('approvedBy.activeBranch', 'approvedByActiveBranch')
            .orderBy('c.createdAt', 'DESC');

        if (filters.status?.trim()) {
            query.andWhere('c.status = :status', { status: filters.status.trim() });
        }
        if (filters.customerId?.trim()) {
            query.andWhere('c.customerId = :customerId', {
                customerId: filters.customerId.trim(),
            });
        }
        if (filters.prospectId?.trim()) {
            query.andWhere('c.prospectId = :prospectId', {
                prospectId: filters.prospectId.trim(),
            });
        }
        if (filters.managerId?.trim()) {
            query.andWhere('c.managerId = :managerId', {
                managerId: filters.managerId.trim(),
            });
        }
        if (filters.company?.trim()) {
            query.andWhere('LOWER(c.company) LIKE LOWER(:company)', {
                company: `%${filters.company.trim()}%`,
            });
        }

        const page = Math.max(1, Number(filters.page) || 1);
        const limit = Math.max(1, Number(filters.limit) || 10);
        query.skip((page - 1) * limit).take(limit);

        const [contracts, total] = await query.getManyAndCount();

        if (!contracts.length) {
            throw new NotFoundException(
                await this.i18nService.translate('contract.not_found', lang),
            );
        }

        return {
            message: await this.i18nService.translate('contract.list_retrieved', lang),
            data: new PaginatedResponseDto(contracts, total, page, limit),
        };
    }

    // ============================================================
    // 🔍 VOIR
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ContractEntity }> {
        const contract = await this.contractRepo.findOne({
            where: { id },
            relations: FULL_RELATIONS,
        });

        if (!contract) {
            throw new NotFoundException(
                await this.i18nService.translate('contract.not_found_by_id', lang, { id }),
            );
        }

        return {
            message: await this.i18nService.translate('contract.found_success', lang, {
                number: contract.number,
            }),
            data: contract,
        };
    }

    // ============================================================
    // ✏️ MODIFIER
    // ============================================================
    async update(
        id: string,
        dto: UpdateContractDto,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ContractEntity }> {
        const { data: contract } = await this.findOne(id, lang);

        if (dto.type !== undefined && (!dto.type || dto.type.trim() === '')) {
            throw new BadRequestException(
                await this.i18nService.translate('contract.type_required', lang),
            );
        }

        const newStartDate = dto.startDate ? new Date(dto.startDate) : contract.startDate;
        const newEndDate = dto.endDate ? new Date(dto.endDate) : contract.endDate;
        if (newEndDate && newStartDate && newEndDate <= newStartDate) {
            throw new BadRequestException(
                await this.i18nService.translate('contract.end_date_before_start', lang),
            );
        }

        // XOR
        const futureCustomerId =
            dto.customerId !== undefined ? dto.customerId : contract.customerId;
        const futureProspectId =
            dto.prospectId !== undefined ? dto.prospectId : contract.prospectId;
        if (futureCustomerId && futureProspectId) {
            throw new BadRequestException(
                await this.i18nService.translate(
                    'contract.customer_and_prospect_exclusive',
                    lang,
                ),
            );
        }

        // Validations
        if (dto.customerId && dto.customerId !== contract.customerId) {
            await this.validateUser(dto.customerId, lang, 'customer');
        }
        if (dto.prospectId && dto.prospectId !== contract.prospectId) {
            await this.validateProspect(dto.prospectId, lang);
        }
        if (dto.managerId && dto.managerId !== contract.managerId) {
            await this.validateUser(dto.managerId, lang, 'manager');
        }
        if (dto.createdById && dto.createdById !== contract.createdById) {
            await this.validateUser(dto.createdById, lang, 'created_by');
        }
        if (dto.approvedById && dto.approvedById !== contract.approvedById) {
            await this.validateUser(dto.approvedById, lang, 'approved_by');
        }

        Object.assign(contract, {
            ...dto,
            ...(dto.type !== undefined && { type: dto.type.trim() }),
            ...(dto.company !== undefined && { company: dto.company?.trim() }),
            ...(dto.startDate && { startDate: new Date(dto.startDate) }),
            ...(dto.endDate && { endDate: new Date(dto.endDate) }),
            ...(dto.approvedAt && { approvedAt: new Date(dto.approvedAt) }),
            ...(dto.signedAt && { signedAt: new Date(dto.signedAt) }),
        });

        const updated = await this.contractRepo.save(contract);

        const full = await this.contractRepo.findOne({
            where: { id: updated.id },
            relations: FULL_RELATIONS,
        });

        return {
            message: await this.i18nService.translate('contract.updated_success', lang, {
                number: updated.number,
            }),
            data: full ?? updated,
        };
    }

    // ============================================================
    // 📄 REMPLACER LE DOCUMENT
    // ============================================================
    async updateDocument(
        id: string,
        lang: string = 'fr',
        file?: Express.Multer.File,
    ): Promise<{ message: string; data: ContractEntity }> {
        const { data: contract } = await this.findOne(id, lang);

        if (!file) {
            throw new BadRequestException(
                await this.i18nService.translate('contract.invalid_document', lang),
            );
        }

        if (contract.documentUrl && contract.documentUrl.includes('/uploads/')) {
            try {
                const parts = contract.documentUrl.split('/');
                const filename = parts.pop()!;
                const subFolder = parts.pop() || 'contract';
                await this.filesService.deleteFile(subFolder, filename);
            } catch (err: any) {
                console.warn('⚠️ Échec suppression ancien document:', err.message);
            }
        }

        const uploaded = await this.filesService.uploadFile(file, 'contract', 'default');
        contract.documentUrl = uploaded.data;

        const updated = await this.contractRepo.save(contract);

        const full = await this.contractRepo.findOne({
            where: { id: updated.id },
            relations: FULL_RELATIONS,
        });

        return {
            message: await this.i18nService.translate(
                'contract.document_updated_success',
                lang,
                { number: updated.number },
            ),
            data: full ?? updated,
        };
    }

    // ============================================================
    // ✅ APPROUVER
    // ============================================================
    async approve(
        id: string,
        approvedById: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ContractEntity }> {
        const { data: contract } = await this.findOne(id, lang);

        if (contract.status !== ContractStatus.DRAFT) {
            throw new BadRequestException(
                await this.i18nService.translate('contract.cannot_approve_non_draft', lang, {
                    current: contract.status,
                }),
            );
        }

        await this.validateUser(approvedById, lang, 'approved_by');

        contract.status = ContractStatus.ACTIVE;
        contract.approvedById = approvedById;
        contract.approvedAt = new Date();

        const updated = await this.contractRepo.save(contract);

        const full = await this.contractRepo.findOne({
            where: { id: updated.id },
            relations: FULL_RELATIONS,
        });

        return {
            message: await this.i18nService.translate('contract.approved_success', lang, {
                number: updated.number,
            }),
            data: full ?? updated,
        };
    }

    // ============================================================
    // ✍️ SIGNER
    // ============================================================
    async sign(
        id: string,
        signedBy: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ContractEntity }> {
        const { data: contract } = await this.findOne(id, lang);

        if (contract.status !== ContractStatus.ACTIVE) {
            throw new BadRequestException(
                await this.i18nService.translate('contract.cannot_sign_non_active', lang, {
                    current: contract.status,
                }),
            );
        }

        if (!signedBy || signedBy.trim() === '') {
            throw new BadRequestException(
                await this.i18nService.translate('contract.signed_by_required', lang),
            );
        }

        contract.signedAt = new Date();
        contract.signedBy = signedBy.trim();

        const updated = await this.contractRepo.save(contract);

        const full = await this.contractRepo.findOne({
            where: { id: updated.id },
            relations: FULL_RELATIONS,
        });

        return {
            message: await this.i18nService.translate('contract.signed_success', lang, {
                number: updated.number,
            }),
            data: full ?? updated,
        };
    }

    // ============================================================
    // 🗑️ SUPPRIMER
    // ============================================================
    async remove(id: string, lang: string = 'fr'): Promise<{ message: string }> {
        const { data: contract } = await this.findOne(id, lang);

        if (contract.documentUrl && contract.documentUrl.includes('/uploads/')) {
            try {
                const parts = contract.documentUrl.split('/');
                const filename = parts.pop()!;
                const subFolder = parts.pop() || 'contract';
                await this.filesService.deleteFile(subFolder, filename);
            } catch (err: any) {
                console.warn('⚠️ Échec suppression document:', err.message);
            }
        }

        await this.contractRepo.remove(contract);

        return {
            message: await this.i18nService.translate('contract.deleted_success', lang, {
                number: contract.number,
            }),
        };
    }

    // ============================================================
    // ⏰ EXPIRANTS
    // ============================================================
    async findExpiring(
        days: number = 30,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ContractEntity[] }> {
        const now = new Date();
        const limit = new Date();
        limit.setDate(limit.getDate() + days);

        const contracts = await this.contractRepo
            .createQueryBuilder('c')
            .leftJoinAndSelect('c.customer', 'customer')
            .leftJoinAndSelect('customer.activeCompany', 'customerActiveCompany')
            .leftJoinAndSelect('c.prospect', 'prospect')
            .leftJoinAndSelect('prospect.company', 'prospectCompany')
            .leftJoinAndSelect('prospect.branch', 'prospectBranch')
            .leftJoinAndSelect('c.manager', 'manager')
            .leftJoinAndSelect('manager.activeCompany', 'managerActiveCompany')
            .leftJoinAndSelect('c.createdBy', 'createdBy')
            .leftJoinAndSelect('createdBy.activeCompany', 'createdByActiveCompany')
            .leftJoinAndSelect('c.approvedBy', 'approvedBy')
            .leftJoinAndSelect('approvedBy.activeCompany', 'approvedByActiveCompany')
            .where('c.endDate IS NOT NULL')
            .andWhere('c.endDate BETWEEN :now AND :limit', { now, limit })
            .andWhere('c.status = :status', { status: ContractStatus.ACTIVE })
            .orderBy('c.endDate', 'ASC')
            .getMany();

        return {
            message: await this.i18nService.translate('contract.expiring_retrieved', lang, {
                days,
                count: contracts.length,
            }),
            data: contracts,
        };
    }
}