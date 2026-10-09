import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProspectEntity } from './entities/prospect.entity';
import { CreateProspectDto } from './dto/create-prospect.dto';
import { UpdateProspectDto } from './dto/update-prospect.dto';
import { QueryProspectDto } from './dto/query-prospect.dto';
import { ConvertProspectDto } from './dto/convert-prospect.dto';
import { ProspectStatus } from '../common/enums/prospect-status.enum';
import { CustomerEntity } from '../customers/entities/customer.entity';
import { CustomerType, CustomerStatus } from '../common/enums/customer.enum';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { UserLoyaltyEntity, LoyaltyTier } from 'src/users/entities/user-loyalty.entity';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { I18nService } from 'src/libs/common/src';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ProspectsService {
    private readonly logger = new Logger(ProspectsService.name);

    constructor(
        @InjectRepository(ProspectEntity)
        private readonly prospectRepo: Repository<ProspectEntity>,

        @InjectRepository(CustomerEntity)
        private readonly customerRepo: Repository<CustomerEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepo: Repository<UserEntity>,

        @InjectRepository(CompanyEntity)
        private readonly companyRepo: Repository<CompanyEntity>,

        @InjectRepository(BranchEntity)
        private readonly branchRepo: Repository<BranchEntity>,

        @InjectRepository(UserLoyaltyEntity)
        private readonly loyaltyRepo: Repository<UserLoyaltyEntity>,

        private readonly smsHelper: SmsHelper,

        private readonly i18nService: I18nService,
    ) { }

    // ============================================================
    // ðŸ”¢ GÃ‰NÃ‰RATION DU CODE DE PARRAINAGE
    // ============================================================
    private async generateReferralCode(
        userId: string,
        existingCodes?: string[],
    ): Promise<string> {
        const userIdShort = userId.substring(0, 4).toUpperCase();

        let code: string;
        let exists = true;
        let attempts = 0;
        const maxAttempts = 10;

        const codesToCheck = new Set(existingCodes || []);

        do {
            const random = Math.random()
                .toString(36)
                .substring(2, 8)
                .toUpperCase()
                .padStart(6, '0');

            code = `${userIdShort}${random}`;

            if (codesToCheck.has(code)) {
                attempts++;
                continue;
            }

            const existingUser = await this.userRepo.findOne({
                where: { referralCode: code },
                select: ['id'],
            });

            exists = !!existingUser;
            attempts++;
        } while (exists && attempts < maxAttempts);

        if (exists) {
            const timestamp = Date.now().toString(36).toUpperCase();
            const randomSuffix = Math.random()
                .toString(36)
                .substring(2, 4)
                .toUpperCase();
            code = `${timestamp.slice(-6)}${randomSuffix}`;

            const existingUser = await this.userRepo.findOne({
                where: { referralCode: code },
                select: ['id'],
            });

            if (existingUser) {
                const uuidPart = uuidv4().substring(0, 8).toUpperCase();
                code = `${uuidPart}`;
            }
        }

        return code;
    }

    // ============================================================
    // ðŸŽ CRÃ‰ER OU RÃ‰CUPÃ‰RER LE COMPTE FIDÃ‰LITÃ‰
    // ============================================================
    private async getOrCreateLoyaltyAccount(
        userId: string,
    ): Promise<UserLoyaltyEntity> {
        const existingLoyalty = await this.loyaltyRepo.findOne({
            where: { userId },
        });

        if (existingLoyalty) {
            return existingLoyalty;
        }

        let code: string;
        let exists: UserLoyaltyEntity | null = null;
        let attempts = 0;
        const maxAttempts = 10;

        do {
            code = Math.floor(10000000 + Math.random() * 90000000).toString();
            exists = await this.loyaltyRepo.findOne({
                where: { loyaltyCode: code },
                select: ['id'],
            });
            attempts++;
        } while (exists && attempts < maxAttempts);

        if (exists) {
            code = Date.now().toString().slice(-8);
        }

        const loyalty = this.loyaltyRepo.create({
            userId,
            loyaltyCode: code,
            pointsBalance: 0,
            pointsTotalEarned: 0,
            pointsTotalSpent: 0,
            currentTier: LoyaltyTier.BRONZE,
            isActive: true,
        });

        try {
            return await this.loyaltyRepo.save(loyalty);
        } catch (error: any) {
            if (error.code === 'ER_DUP_ENTRY' || error.message?.includes('Duplicate')) {
                const existing = await this.loyaltyRepo.findOne({
                    where: { userId },
                });
                if (existing) return existing;
            }
            throw error;
        }
    }

    // ============================================================
    // ðŸ”’ VÃ‰RIFIER UN COMMERCIAL ASSIGNÃ‰
    // ============================================================
    private async validateAssignedTo(
        userId: string,
        lang: string = 'fr',
    ): Promise<UserEntity> {
        const user = await this.userRepo.findOne({ where: { id: userId } });

        if (!user) {
            throw new NotFoundException(
                await this.i18nService.translate('prospect.assigned_to_not_found', lang, {
                    id: userId,
                }),
            );
        }

        if (!user.isActive) {
            throw new BadRequestException(
                await this.i18nService.translate('prospect.assigned_to_inactive', lang, {
                    name: user.fullName,
                }),
            );
        }

        return user;
    }

    // ============================================================
    // ðŸ”’ VÃ‰RIFIER UNE ENTREPRISE
    // ============================================================
    private async validateCompany(
        companyId: string,
        lang: string = 'fr',
    ): Promise<CompanyEntity> {
        const company = await this.companyRepo.findOne({ where: { id: companyId } });
        if (!company) {
            throw new NotFoundException(
                await this.i18nService.translate('prospect.company_not_found', lang, {
                    id: companyId,
                }),
            );
        }
        return company;
    }

    // ============================================================
    // ðŸ”’ VÃ‰RIFIER UNE BRANCHE
    // ============================================================
    private async validateBranch(
        branchId: string,
        lang: string = 'fr',
    ): Promise<BranchEntity> {
        const branch = await this.branchRepo.findOne({ where: { id: branchId } });
        if (!branch) {
            throw new NotFoundException(
                await this.i18nService.translate('prospect.branch_not_found', lang, {
                    id: branchId,
                }),
            );
        }
        return branch;
    }

    // ============================================================
    // âž• CRÃ‰ER UN PROSPECT
    // ============================================================
    async create(
        dto: CreateProspectDto,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ProspectEntity }> {
        if (!dto.fullName || dto.fullName.trim() === '') {
            throw new BadRequestException(
                await this.i18nService.translate('prospect.full_name_required', lang),
            );
        }

        const status = dto.status || ProspectStatus.NEW;

        if (dto.assignedToId) {
            await this.validateAssignedTo(dto.assignedToId, lang);
        }

        if (dto.companyId) {
            await this.validateCompany(dto.companyId, lang);
        }

        if (dto.branchId) {
            await this.validateBranch(dto.branchId, lang);
        }

        const prospect = this.prospectRepo.create({
            ...dto,
            fullName: dto.fullName.trim(),
            email: dto.email?.toLowerCase().trim(),
            status,
        });

        const saved = await this.prospectRepo.save(prospect);

        return {
            message: await this.i18nService.translate('prospect.created_success', lang, {
                name: saved.fullName,
            }),
            data: saved,
        };
    }

    // ============================================================
    // ðŸ“‹ LISTER LES PROSPECTS
    // ============================================================
    async findAll(
        query: QueryProspectDto,
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<ProspectEntity>;
    }> {
        const {
            page = 1,
            limit = 10,
            status,
            assignedToId,
            companyId,
            search,
        } = query;

        const qb = this.prospectRepo
            .createQueryBuilder('p')
            .leftJoinAndSelect('p.assignedTo', 'assignedTo')
            .leftJoinAndSelect('p.company', 'company')
            .leftJoinAndSelect('p.branch', 'branch')
            .orderBy('p.createdAt', 'DESC');

        if (status) qb.andWhere('p.status = :status', { status });
        if (assignedToId?.trim()) {
            qb.andWhere('p.assignedToId = :assignedToId', { assignedToId: assignedToId.trim() });
        }
        if (companyId?.trim()) {
            qb.andWhere('p.companyId = :companyId', { companyId: companyId.trim() });
        }
        if (search?.trim()) {
            qb.andWhere(
                '(p.fullName LIKE :s OR p.email LIKE :s OR p.phone LIKE :s OR p.companyName LIKE :s)',
                { s: `%${search.trim()}%` },
            );
        }

        const currentPage = Math.max(1, Number(page) || 1);
        const currentLimit = Math.max(1, Number(limit) || 10);
        const skip = (currentPage - 1) * currentLimit;

        qb.skip(skip).take(currentLimit);

        const [prospects, total] = await qb.getManyAndCount();

        if (!prospects.length) {
            throw new NotFoundException(
                await this.i18nService.translate('prospect.not_found', lang),
            );
        }

        return {
            message: await this.i18nService.translate('prospect.list_retrieved', lang),
            data: new PaginatedResponseDto(prospects, total, currentPage, currentLimit),
        };
    }

    // ============================================================
    // ðŸ” VOIR UN PROSPECT
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ProspectEntity }> {
        const prospect = await this.prospectRepo.findOne({
            where: { id },
            relations: ['assignedTo', 'company', 'branch'],
        });

        if (!prospect) {
            throw new NotFoundException(
                await this.i18nService.translate('prospect.not_found_by_id', lang, { id }),
            );
        }

        return {
            message: await this.i18nService.translate('prospect.found_success', lang, {
                name: prospect.fullName,
            }),
            data: prospect,
        };
    }

    // ============================================================
    // âœï¸ MODIFIER UN PROSPECT
    // ============================================================
    async update(
        id: string,
        dto: UpdateProspectDto,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ProspectEntity }> {
        const { data: prospect } = await this.findOne(id, lang);

        if (dto.fullName !== undefined && (!dto.fullName || dto.fullName.trim() === '')) {
            throw new BadRequestException(
                await this.i18nService.translate('prospect.full_name_required', lang),
            );
        }

        if (dto.assignedToId && dto.assignedToId !== prospect.assignedToId) {
            await this.validateAssignedTo(dto.assignedToId, lang);
        }

        if (dto.companyId && dto.companyId !== prospect.companyId) {
            await this.validateCompany(dto.companyId, lang);
        }

        if (dto.branchId && dto.branchId !== prospect.branchId) {
            await this.validateBranch(dto.branchId, lang);
        }

        Object.assign(prospect, {
            ...dto,
            ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
            ...(dto.email !== undefined && { email: dto.email?.toLowerCase().trim() }),
        });

        const updated = await this.prospectRepo.save(prospect);

        return {
            message: await this.i18nService.translate('prospect.updated_success', lang, {
                name: updated.fullName,
            }),
            data: updated,
        };
    }

    // ============================================================
    // ðŸ—‘ï¸ SUPPRIMER UN PROSPECT
    // ============================================================
    async remove(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string }> {
        const { data: prospect } = await this.findOne(id, lang);
        await this.prospectRepo.remove(prospect);

        return {
            message: await this.i18nService.translate('prospect.deleted_success', lang, {
                name: prospect.fullName,
            }),
        };
    }

    // ============================================================
    // ðŸ”„ CONVERSION : Prospect â†’ Customer (+ User + SMS)
    // âœ… SMS envoyÃ© DANS TOUS LES CAS (avec password)
    // ============================================================
    async convertToCustomer(
        prospectId: string,
        dto: ConvertProspectDto,
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: {
            prospect: ProspectEntity;
            customer: CustomerEntity;
            user?: UserEntity;
            defaultPasswordUsed?: boolean;
            smsSent?: boolean;
            smsSkipped?: boolean;
            smsSkipReason?: string;
        };
    }> {
        // ============================================================
        // 1ï¸âƒ£ RÃ‰CUPÃ‰RER LE PROSPECT
        // ============================================================
        const { data: prospect } = await this.findOne(prospectId, lang);

        // ============================================================
        // 2ï¸âƒ£ VÃ‰RIFICATIONS
        // ============================================================
        if (prospect.status === ProspectStatus.WON) {
            throw new BadRequestException(
                await this.i18nService.translate('prospect.already_converted', lang, {
                    name: prospect.fullName,
                }),
            );
        }

        if (prospect.status === ProspectStatus.LOST) {
            throw new BadRequestException(
                await this.i18nService.translate('prospect.cannot_convert_lost', lang, {
                    name: prospect.fullName,
                }),
            );
        }

        if (!prospect.email && !prospect.phone) {
            throw new BadRequestException(
                await this.i18nService.translate('prospect.email_or_phone_required', lang),
            );
        }

        let user: UserEntity | undefined;
        let defaultPasswordUsed = false;
        let rawPassword = '';
        let smsSent = false;
        let smsSkipped = false;
        let smsSkipReason: string | undefined;
        let existingUserReused = false;
        const DEFAULT_CLIENT_PASSWORD = 'FavorHelp@2025';

        // ============================================================
        // 3ï¸âƒ£ CRÃ‰ER LE USER (MÃŠME LOGIQUE QUE createUserByAdmin)
        // ============================================================
        if (dto.createUserAccount !== false) {
            const existing = await this.userRepo.findOne({
                where: [
                    ...(prospect.email ? [{ email: prospect.email }] : []),
                    ...(prospect.phone ? [{ phone: prospect.phone }] : []),
                ],
            });

            if (existing) {
                user = existing;
                existingUserReused = true;
                this.logger.log(`â„¹ï¸ [convertToCustomer] User existant rÃ©utilisÃ©: ${user.id}`);
            } else {
                const usedDefault = !dto.password || dto.password.trim() === '';
                rawPassword = usedDefault ? DEFAULT_CLIENT_PASSWORD : dto.password!;
                const hashed = await bcrypt.hash(rawPassword, 10);
                defaultPasswordUsed = usedDefault;

                const newUser = this.userRepo.create({
                    fullName: prospect.fullName,
                    email: prospect.email || undefined,
                    phone: prospect.phone || undefined,
                    password: hashed,
                    role: UserRole.CUSTOMER,
                    isActive: true,
                    provider: 'commercial-conversion',
                    country: (prospect as any).country || undefined,
                    city: (prospect as any).city || undefined,
                });

                user = await this.userRepo.save(newUser);

                // ðŸ”¥ referralCode
                const referralCodeGenerated = await this.generateReferralCode(user.id);
                user.referralCode = referralCodeGenerated;
                await this.userRepo.save(user);

                this.logger.log(
                    `âœ… [convertToCustomer] User crÃ©Ã©: ${user.id} avec referralCode: ${referralCodeGenerated}`,
                );

                // ðŸ”¥ Loyalty
                const loyalty = await this.getOrCreateLoyaltyAccount(user.id);
                await this.loyaltyRepo.save(loyalty);

                this.logger.log(`âœ… [convertToCustomer] Loyalty crÃ©Ã© pour: ${user.id}`);
            }
        }

        // ============================================================
        // 4ï¸âƒ£ VÃ‰RIFIER QU'AUCUN CUSTOMER N'EXISTE DÃ‰JÃ€
        // ============================================================
        if (user) {
            const existingCustomer = await this.customerRepo.findOne({
                where: { userId: user.id },
            });
            if (existingCustomer) {
                throw new BadRequestException(
                    await this.i18nService.translate('prospect.customer_already_exists', lang, {
                        name: prospect.fullName,
                    }),
                );
            }
        }

        // ============================================================
        // 5ï¸âƒ£ CRÃ‰ER LE CUSTOMER
        // ============================================================
        const customer = this.customerRepo.create({
            fullName: prospect.fullName,
            companyName: prospect.companyName,
            email: prospect.email,
            phone: prospect.phone,
            address: prospect.address,
            sector: prospect.sector,
            type: prospect.companyName ? CustomerType.COMPANY : CustomerType.INDIVIDUAL,
            status: CustomerStatus.ACTIVE,
            userId: user?.id,
            commercialManagerId: prospect.assignedToId,
            companyId: prospect.companyId,
            branchId: prospect.branchId,
        });
        const savedCustomer = await this.customerRepo.save(customer);

        // ============================================================
        // 6ï¸âƒ£ MARQUER LE PROSPECT COMME CONVERTI
        // ============================================================
        prospect.status = ProspectStatus.WON;
        const updatedProspect = await this.prospectRepo.save(prospect);

        // ============================================================
        // 7ï¸âƒ£ ðŸ“± ENVOYER SMS DE BIENVENUE (DANS TOUS LES CAS)
        // ============================================================
        if (user && dto.createUserAccount !== false) {
            if (existingUserReused) {
                smsSkipped = true;
                smsSkipReason = 'User existant rÃ©utilisÃ© (pas de nouveau mot de passe)';
                this.logger.log(`â„¹ï¸ [convertToCustomer] SMS ignorÃ© : user existant`);
            } else if (!user.phone || user.phone.trim() === '') {
                smsSkipped = true;
                smsSkipReason = 'Aucun numÃ©ro de tÃ©lÃ©phone';
                this.logger.warn(`âš ï¸ [convertToCustomer] SMS ignorÃ© : pas de phone`);
            } else if (!rawPassword) {
                smsSkipped = true;
                smsSkipReason = 'Mot de passe non disponible';
                this.logger.warn(`âš ï¸ [convertToCustomer] SMS ignorÃ© : pas de password`);
            } else {
                // âœ… Envoi du SMS (avec mot de passe, custom ou par dÃ©faut)
                try {
                    const smsMessage = await this.i18nService.translate(
                        'prospect.welcome_sms_converted',
                        lang,
                        {
                            fullName: user.fullName,
                            email: user.email || 'N/A',
                            phone: user.phone,
                            password: rawPassword,
                            referralCode: user.referralCode || 'N/A',
                            appUrl: 'https://favorhelp.com',
                        },
                    );

                    smsSent = await this.smsHelper.sendSms(user.phone, smsMessage);

                    if (smsSent) {
                        this.logger.log(`âœ… [convertToCustomer] SMS envoyÃ© Ã  ${user.phone}`);
                    } else {
                        this.logger.warn(`âš ï¸ [convertToCustomer] Ã‰chec SMS Ã  ${user.phone}`);
                    }
                } catch (error: any) {
                    this.logger.error(
                        `âŒ [convertToCustomer] Erreur SMS: ${error.message}`,
                    );
                    smsSent = false;
                }
            }
        }

        // ============================================================
        // 8ï¸âƒ£ RETOUR
        // ============================================================
        const responseData: any = {
            prospect: updatedProspect,
            customer: savedCustomer,
            user,
            smsSent,
        };

        if (defaultPasswordUsed) {
            responseData.defaultPasswordUsed = true;
        }

        if (smsSkipped) {
            responseData.smsSkipped = true;
            responseData.smsSkipReason = smsSkipReason;
        }

        return {
            message: await this.i18nService.translate('prospect.converted_success', lang, {
                name: prospect.fullName,
            }),
            data: responseData,
        };
    }
}