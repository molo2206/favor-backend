import {
    BadRequestException,
    ConflictException,
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
import { AssignProspectDto, BulkAssignProspectsDto, CheckProspectDuplicatesDto, LinkProspectAccountDto } from './dto/prospect-tracking.dto';
import { ProspectStatus } from '../common/enums/prospect-status.enum';
import { ProspectHistoryAction, ProspectSocialNetwork, isSocialSource } from '../common/enums/prospect-tracking.enum';
import { CustomerEntity } from '../customers/entities/customer.entity';
import { CustomerType, CustomerStatus } from '../common/enums/customer.enum';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { UserLoyaltyEntity, LoyaltyTier } from 'src/users/entities/user-loyalty.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { I18nService } from 'src/libs/common/src';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { SmsService } from 'src/users/utility/sms/sms.service';
import { ProspectActor, ProspectTrackingService } from './prospect-tracking.service';
import { ProspectHistoryEntity } from './entities/prospect-history.entity';
import { ProspectAssignmentEntity } from './entities/prospect-assignment.entity';

/** Infos utilisateur réduites renvoyées avec un prospect (jamais le mot de passe) */
const USER_FIELDS = ['id', 'fullName', 'email', 'phone', 'image', 'role', 'isActive'];

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

        @InjectRepository(ProspectHistoryEntity)
        private readonly historyRepo: Repository<ProspectHistoryEntity>,

        @InjectRepository(ProspectAssignmentEntity)
        private readonly assignmentRepo: Repository<ProspectAssignmentEntity>,

        private readonly smsService: SmsService,

        private readonly i18nService: I18nService,

        private readonly tracking: ProspectTrackingService,
    ) { }

    // ============================================================
    // 🔢 GÉNÉRATION DU CODE DE PARRAINAGE
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
    // 🎁 CRÉER OU RÉCUPÉRER LE COMPTE FIDÉLITÉ
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
    // 🔒 VÉRIFIER UN COMMERCIAL ASSIGNÉ
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
    // 🔒 VÉRIFIER UNE ENTREPRISE
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
    // 🌍 PAYS / VILLE
    // ============================================================
    private async resolveLocation(
        countryId: string | null | undefined,
        cityId: string | null | undefined,
        lang: string,
    ): Promise<{ countryId: string | null; countryName: string | null; cityId: string | null; cityName: string | null }> {
        let countryName: string | null = null;
        let cityName: string | null = null;
        let cId = countryId || null;
        if (cityId) {
            const [city] = await this.prospectRepo.query('SELECT id, name, countryId FROM cities WHERE id = ?', [cityId]);
            if (!city) throw new NotFoundException(await this.i18nService.translate('prospect.city_not_found', lang));
            if (cId && city.countryId !== cId) {
                throw new BadRequestException(await this.i18nService.translate('prospect.city_not_in_country', lang, { city: city.name }));
            }
            cId = city.countryId;
            cityName = city.name;
        }
        if (cId) {
            const [country] = await this.prospectRepo.query('SELECT id, name FROM countries WHERE id = ?', [cId]);
            if (!country) throw new NotFoundException(await this.i18nService.translate('prospect.country_not_found', lang));
            countryName = country.name;
        }
        return { countryId: cId, countryName, cityId: cityId || null, cityName };
    }

    /** Source « Réseau social » : réseau obligatoire ; « Autres » : nom obligatoire ; autre source : champs vidés */
    private async normalizeSocial(
        source: string | null | undefined,
        socialNetwork: ProspectSocialNetwork | null | undefined,
        other: string | null | undefined,
        lang: string,
    ): Promise<{ source: string | null; socialNetwork: ProspectSocialNetwork | null; socialNetworkOther: string | null }> {
        let src = source?.trim() || null;
        if (!src && socialNetwork) src = 'SOCIAL_NETWORK';
        if (!isSocialSource(src)) return { source: src, socialNetwork: null, socialNetworkOther: null };
        if (!socialNetwork) throw new BadRequestException(await this.i18nService.translate('prospect.social_network_required', lang));
        if (socialNetwork === ProspectSocialNetwork.OTHER && !other?.trim()) {
            throw new BadRequestException(await this.i18nService.translate('prospect.social_network_other_required', lang));
        }
        return {
            source: src,
            socialNetwork,
            socialNetworkOther: socialNetwork === ProspectSocialNetwork.OTHER ? other!.trim().slice(0, 100) : null,
        };
    }

    private cleanLanguages(list?: string[] | null): string[] | null {
        if (!list) return null;
        const seen = new Set<string>();
        const out: string[] = [];
        for (const l of list) {
            const v = String(l ?? '').trim();
            if (v && !seen.has(v.toLowerCase())) {
                seen.add(v.toLowerCase());
                out.push(v.slice(0, 50));
            }
        }
        return out.length ? out : null;
    }

    /** Dates de suivi quand le statut change (traité, converti, rejeté) */
    private applyStatusDates(p: ProspectEntity, oldStatus: ProspectStatus | null, newStatus: ProspectStatus) {
        if (oldStatus === newStatus) return;
        const now = new Date();
        p.statusChangedAt = now;
        if (newStatus !== ProspectStatus.NEW && !p.processedAt) p.processedAt = now;
        if (newStatus === ProspectStatus.WON) p.convertedAt = now;
        if (newStatus === ProspectStatus.LOST) p.lostAt = now;
        if (oldStatus === ProspectStatus.LOST && newStatus !== ProspectStatus.LOST) {
            p.lostAt = null;
            p.lostReason = null;
        }
    }

    /** Motif obligatoire pour un prospect rejeté / non intéressé (PROSPECT_LOST_REASON_REQUIRED=false pour désactiver) */
    private async assertLostReason(reason: string | null | undefined, lang: string) {
        if (String(process.env.PROSPECT_LOST_REASON_REQUIRED ?? 'true').toLowerCase() === 'false') return;
        if (!reason || !String(reason).trim()) {
            throw new BadRequestException(await this.i18nService.translate('prospect.lost_reason_required', lang));
        }
    }

    private toDate(v: string | null | undefined): Date | null | undefined {
        if (v === undefined) return undefined;
        if (v === null || v === '') return null;
        const d = new Date(v);
        return isNaN(d.getTime()) ? undefined : d;
    }

    // ============================================================
    // 🔎 DOUBLONS : COMPTE / PROSPECT / CLIENT EXISTANTS
    // ============================================================
    async checkDuplicates(dto: CheckProspectDuplicatesDto, user: ProspectActor, lang: string = 'fr') {
        const found = await this.tracking.findDuplicates(dto);
        const full = this.tracking.isAdmin(user);
        const hasAccount = found.users.length > 0;
        const message = hasAccount
            ? await this.i18nService.translate('prospect.account_exists', lang, { name: found.users[0].fullName })
            : found.prospects.length || found.customers.length
                ? await this.i18nService.translate('prospect.duplicate_exists', lang)
                : await this.i18nService.translate('prospect.no_duplicate', lang);
        return {
            message,
            data: {
                hasAccount,
                hasProspect: found.prospects.length > 0,
                hasCustomer: found.customers.length > 0,
                accounts: found.users.map((u) => this.tracking.accountView(u, full)),
                prospects: found.prospects.map((p) => ({
                    id: p.id,
                    fullName: p.fullName,
                    status: p.status,
                    createdAt: p.createdAt,
                    assignedTo: p.assignedToId ? { id: p.assignedToId, fullName: p.assignedToName } : null,
                    createdBy: p.createdById ? { id: p.createdById, fullName: p.createdByName } : null,
                    linkedUserId: p.linkedUserId ?? null,
                    matchedBy: p.matchedBy,
                })),
                customers: found.customers.map((c) => ({ id: c.id, fullName: c.fullName, status: c.status, userId: c.userId ?? null, matchedBy: c.matchedBy })),
            },
        };
    }

    /** Refuse un enregistrement en double sauf confirmation explicite */
    private async guardDuplicates(
        dto: { phone?: string; email?: string; confirmExistingAccount?: boolean; allowDuplicateProspect?: boolean },
        user: ProspectActor,
        lang: string,
        excludeProspectId?: string,
    ): Promise<{ accountId: string | null }> {
        if (!dto.phone && !dto.email) return { accountId: null };
        const check = await this.checkDuplicates({ phone: dto.phone, email: dto.email, excludeProspectId }, user, lang);
        const d = check.data;
        const blockAccount = d.hasAccount && !dto.confirmExistingAccount;
        const blockProspect = (d.hasProspect || d.hasCustomer) && !dto.allowDuplicateProspect;
        if (blockAccount || blockProspect) {
            throw new ConflictException({
                statusCode: 409,
                code: blockAccount ? 'PROSPECT_HAS_ACCOUNT' : 'PROSPECT_DUPLICATE',
                message: check.message,
                ...d,
                hint: blockAccount
                    ? await this.i18nService.translate('prospect.account_exists_hint', lang)
                    : await this.i18nService.translate('prospect.duplicate_hint', lang),
            });
        }
        return { accountId: d.hasAccount ? d.accounts[0]!.id : null };
    }

    // ============================================================
    // ➕ CRÉER
    // ============================================================
    async create(
        dto: CreateProspectDto,
        lang: string = 'fr',
        user?: ProspectActor,
    ): Promise<{ message: string; data: ProspectEntity }> {
        if (!dto.fullName || dto.fullName.trim() === '') {
            throw new BadRequestException(
                await this.i18nService.translate('prospect.full_name_required', lang),
            );
        }

        const status = dto.status || ProspectStatus.NEW;

        let assignee: UserEntity | null = null;
        if (dto.assignedToId) {
            assignee = await this.validateAssignedTo(dto.assignedToId, lang);
        }

        if (dto.companyId) {
            await this.validateCompany(dto.companyId, lang);
        }

        if (dto.branchId) {
            await this.validateBranch(dto.branchId, lang);
        }

        const location = await this.resolveLocation(dto.countryId, dto.cityId, lang);
        const social = await this.normalizeSocial(dto.source, dto.socialNetwork, dto.socialNetworkOther, lang);

        if (status === ProspectStatus.LOST) await this.assertLostReason(dto.lostReason, lang);

        // ✅ Personne déjà inscrite / déjà enregistrée comme prospect ou client
        const { accountId } = await this.guardDuplicates(dto, user, lang);

        const prospect = this.prospectRepo.create({
            fullName: dto.fullName.trim(),
            companyName: dto.companyName?.trim(),
            email: dto.email?.toLowerCase().trim(),
            phone: dto.phone?.trim(),
            address: dto.address?.trim(),
            sector: dto.sector?.trim(),
            source: social.source ?? undefined,
            socialNetwork: social.socialNetwork,
            socialNetworkOther: social.socialNetworkOther,
            ...location,
            languages: this.cleanLanguages(dto.languages),
            identifiedNeed: dto.identifiedNeed?.trim(),
            productInterest: dto.productInterest?.trim(),
            estimatedBudget: dto.estimatedBudget,
            conversionProbability: dto.conversionProbability,
            status,
            lostReason: status === ProspectStatus.LOST ? dto.lostReason?.trim() || null : null,
            assignedToId: dto.assignedToId,
            assignedById: dto.assignedToId ? user?.id ?? null : null,
            assignedAt: dto.assignedToId ? new Date() : null,
            companyId: dto.companyId,
            branchId: dto.branchId,
            nextAction: dto.nextAction?.trim() || undefined,
            nextActionAt: this.toDate(dto.nextActionAt) ?? undefined,
            lastContactAt: this.toDate(dto.lastContactAt) ?? undefined,
            createdById: user?.id ?? null,
            linkedUserId: accountId,
            linkedAt: accountId ? new Date() : null,
        });
        if (status !== ProspectStatus.NEW) this.applyStatusDates(prospect, ProspectStatus.NEW, status);

        const saved: ProspectEntity = await this.prospectRepo.save(prospect);

        await this.tracking.log({ prospect: saved, action: ProspectHistoryAction.CREATED, user, newStatus: saved.status });
        if (assignee) {
            const type = await this.tracking.logAssignment({ prospect: saved, toUser: assignee, by: user });
            await this.tracking.log({ prospect: saved, action: type as any, user, metadata: { toUserId: assignee.id, toUserName: assignee.fullName } });
        }
        if (accountId) {
            await this.tracking.log({ prospect: saved, action: ProspectHistoryAction.ACCOUNT_LINKED, user, metadata: { userId: accountId, auto: true } });
        }

        return {
            message: accountId
                ? await this.i18nService.translate('prospect.created_linked_account', lang, { name: saved.fullName })
                : await this.i18nService.translate('prospect.created_success', lang, { name: saved.fullName }),
            data: saved,
        };
    }

    // ============================================================
    // 📋 LISTE
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
            .leftJoin('p.createdBy', 'createdBy')
            .addSelect(USER_FIELDS.map((f) => `createdBy.${f}`))
            .leftJoin('p.linkedUser', 'linkedUser')
            .addSelect(USER_FIELDS.map((f) => `linkedUser.${f}`))
            .orderBy('p.createdAt', 'DESC');

        if (status) qb.andWhere('p.status = :status', { status });
        if (assignedToId?.trim()) {
            qb.andWhere('p.assignedToId = :assignedToId', { assignedToId: assignedToId.trim() });
        }
        if (companyId?.trim()) {
            qb.andWhere('p.companyId = :companyId', { companyId: companyId.trim() });
        }
        if (query.createdById?.trim()) qb.andWhere('p.createdById = :createdById', { createdById: query.createdById.trim() });
        if (query.countryId?.trim()) qb.andWhere('p.countryId = :countryId', { countryId: query.countryId.trim() });
        if (query.cityId?.trim()) qb.andWhere('p.cityId = :cityId', { cityId: query.cityId.trim() });
        if (query.source?.trim()) qb.andWhere('p.source = :source', { source: query.source.trim() });
        if (query.socialNetwork) qb.andWhere('p.socialNetwork = :socialNetwork', { socialNetwork: query.socialNetwork });
        if (query.language?.trim()) qb.andWhere('JSON_SEARCH(p.languages, \'one\', :language) IS NOT NULL', { language: query.language.trim() });
        if (query.hasAccount === 'true') qb.andWhere('p.linkedUserId IS NOT NULL');
        if (query.hasAccount === 'false') qb.andWhere('p.linkedUserId IS NULL');
        if (query.startDate) qb.andWhere('p.createdAt >= :startDate', { startDate: new Date(query.startDate) });
        if (query.endDate) {
            const end = new Date(query.endDate);
            if (/^\d{4}-\d{2}-\d{2}$/.test(query.endDate)) end.setHours(23, 59, 59, 999);
            qb.andWhere('p.createdAt <= :endDate', { endDate: end });
        }
        if (search?.trim()) {
            qb.andWhere(
                '(p.fullName LIKE :s OR p.email LIKE :s OR p.phone LIKE :s OR p.companyName LIKE :s OR p.cityName LIKE :s)',
                { s: `%${search.trim()}%` },
            );
        }

        const currentPage = Math.max(1, Number(page) || 1);
        const currentLimit = Math.max(1, Number(limit) || 10);
        const skip = (currentPage - 1) * currentLimit;

        qb.skip(skip).take(currentLimit);

        const [prospects, total] = await qb.getManyAndCount();

        // ✅ Liste vide : réponse normale (plus d'erreur 404)
        return {
            message: await this.i18nService.translate(prospects.length ? 'prospect.list_retrieved' : 'prospect.not_found', lang),
            data: new PaginatedResponseDto(prospects, total, currentPage, currentLimit),
        };
    }

    // ============================================================
    // 🔍 DÉTAIL
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: ProspectEntity }> {
        const prospect = await this.prospectRepo
            .createQueryBuilder('p')
            .leftJoinAndSelect('p.assignedTo', 'assignedTo')
            .leftJoinAndSelect('p.company', 'company')
            .leftJoinAndSelect('p.branch', 'branch')
            .leftJoin('p.createdBy', 'createdBy')
            .addSelect(USER_FIELDS.map((f) => `createdBy.${f}`))
            .leftJoin('p.linkedUser', 'linkedUser')
            .addSelect(USER_FIELDS.map((f) => `linkedUser.${f}`))
            .where('p.id = :id', { id })
            .getOne();

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

    /** Prospect sans relations (pour les modifications) */
    private async getRaw(id: string, lang: string): Promise<ProspectEntity> {
        const p = await this.prospectRepo.findOne({ where: { id } });
        if (!p) throw new NotFoundException(await this.i18nService.translate('prospect.not_found_by_id', lang, { id }));
        return p;
    }

    // ============================================================
    // ✏️ MODIFIER
    // ============================================================
    async update(
        id: string,
        dto: UpdateProspectDto,
        lang: string = 'fr',
        user?: ProspectActor,
    ): Promise<{ message: string; data: ProspectEntity & { duplicateWarning?: any } }> {
        const prospect = await this.getRaw(id, lang);
        const before = { ...prospect } as ProspectEntity;

        if (dto.fullName !== undefined && (!dto.fullName || dto.fullName.trim() === '')) {
            throw new BadRequestException(
                await this.i18nService.translate('prospect.full_name_required', lang),
            );
        }

        let newAssignee: UserEntity | null = null;
        if (dto.assignedToId && dto.assignedToId !== prospect.assignedToId) {
            newAssignee = await this.validateAssignedTo(dto.assignedToId, lang);
        }

        if (dto.companyId && dto.companyId !== prospect.companyId) {
            await this.validateCompany(dto.companyId, lang);
        }

        if (dto.branchId && dto.branchId !== prospect.branchId) {
            await this.validateBranch(dto.branchId, lang);
        }

        const {
            countryId, cityId, socialNetwork, socialNetworkOther, languages, confirmExistingAccount, allowDuplicateProspect,
            lostReason, source, nextActionAt, lastContactAt, ...rest
        } = dto;

        Object.assign(prospect, {
            ...rest,
            ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
            ...(dto.email !== undefined && { email: dto.email?.toLowerCase().trim() }),
        });

        // Pays / ville
        if (countryId !== undefined || cityId !== undefined) {
            const loc = await this.resolveLocation(
                countryId !== undefined ? countryId : prospect.countryId,
                cityId !== undefined ? cityId : countryId !== undefined && countryId !== prospect.countryId ? null : prospect.cityId,
                lang,
            );
            Object.assign(prospect, loc);
        }
        // Source / réseau social
        if (source !== undefined || socialNetwork !== undefined || socialNetworkOther !== undefined) {
            const social = await this.normalizeSocial(
                source !== undefined ? source : prospect.source,
                socialNetwork !== undefined ? socialNetwork : prospect.socialNetwork,
                socialNetworkOther !== undefined ? socialNetworkOther : prospect.socialNetworkOther,
                lang,
            );
            prospect.source = social.source ?? undefined;
            prospect.socialNetwork = social.socialNetwork;
            prospect.socialNetworkOther = social.socialNetworkOther;
        }
        if (languages !== undefined) prospect.languages = this.cleanLanguages(languages);
        const nad = this.toDate(nextActionAt);
        if (nad !== undefined) (prospect as any).nextActionAt = nad;
        const lcd = this.toDate(lastContactAt);
        if (lcd !== undefined) (prospect as any).lastContactAt = lcd;

        // Statut
        const newStatus = (dto.status ?? before.status) as ProspectStatus;
        if (newStatus === ProspectStatus.LOST && before.status !== ProspectStatus.LOST) {
            await this.assertLostReason(lostReason !== undefined ? lostReason : before.lostReason, lang);
        }
        this.applyStatusDates(prospect, before.status, newStatus);
        if (lostReason !== undefined) prospect.lostReason = lostReason?.trim() || null;

        // Responsable
        const assignmentChanged = dto.assignedToId !== undefined && (dto.assignedToId || null) !== (before.assignedToId || null);
        if (assignmentChanged) {
            prospect.assignedToId = dto.assignedToId || undefined;
            prospect.assignedById = user?.id ?? null;
            prospect.assignedAt = new Date();
        }

        // ✅ Téléphone / e-mail modifiés : avertissement si la personne a déjà un compte (sans bloquer)
        let duplicateWarning: any = null;
        if ((dto.phone !== undefined && dto.phone !== before.phone) || (dto.email !== undefined && dto.email?.toLowerCase().trim() !== before.email)) {
            const check = await this.checkDuplicates({ phone: prospect.phone, email: prospect.email, excludeProspectId: id }, user, lang);
            if (check.data.hasAccount || check.data.hasProspect || check.data.hasCustomer) duplicateWarning = { message: check.message, ...check.data };
            if (check.data.hasAccount && !prospect.linkedUserId && confirmExistingAccount) {
                prospect.linkedUserId = check.data.accounts[0]!.id;
                prospect.linkedAt = new Date();
            }
        }

        const updated = await this.prospectRepo.save(prospect);

        // Historique
        const changes = this.tracking.diff(before, updated);
        if (Object.keys(changes).length) {
            await this.tracking.log({ prospect: updated, action: ProspectHistoryAction.UPDATED, user, changes });
        }
        if (before.status !== updated.status) {
            await this.tracking.log({
                prospect: updated,
                action: updated.status === ProspectStatus.WON ? ProspectHistoryAction.CONVERTED : ProspectHistoryAction.STATUS_CHANGED,
                user,
                oldStatus: before.status,
                newStatus: updated.status,
                note: updated.status === ProspectStatus.LOST ? updated.lostReason ?? null : null,
            });
            if (before.status === ProspectStatus.NEW && !before.processedAt) {
                await this.tracking.log({ prospect: updated, action: ProspectHistoryAction.PROCESSED, user, oldStatus: before.status, newStatus: updated.status });
            }
        }
        if (assignmentChanged) {
            const fromUser = before.assignedToId ? await this.userRepo.findOne({ where: { id: before.assignedToId }, select: ['id', 'fullName'] }) : null;
            const type = await this.tracking.logAssignment({ prospect: updated, fromUser, toUser: newAssignee, by: user });
            await this.tracking.log({
                prospect: updated,
                action: type as any,
                user,
                metadata: { fromUserId: fromUser?.id ?? null, fromUserName: fromUser?.fullName ?? null, toUserId: newAssignee?.id ?? null, toUserName: newAssignee?.fullName ?? null },
            });
        }
        if (!before.linkedUserId && updated.linkedUserId) {
            await this.tracking.log({ prospect: updated, action: ProspectHistoryAction.ACCOUNT_LINKED, user, metadata: { userId: updated.linkedUserId } });
        }

        return {
            message: await this.i18nService.translate('prospect.updated_success', lang, {
                name: updated.fullName,
            }),
            data: duplicateWarning ? Object.assign(updated, { duplicateWarning }) : updated,
        };
    }

    // ============================================================
    // 👥 ASSIGNER / TRANSFÉRER
    // ============================================================
    async assign(id: string, dto: AssignProspectDto, user: ProspectActor, lang: string = 'fr') {
        const prospect = await this.getRaw(id, lang);
        const toId = dto.toUserId || null;
        if ((prospect.assignedToId || null) === toId) {
            return { message: await this.i18nService.translate('prospect.assign_unchanged', lang), data: prospect };
        }
        const toUser = toId ? await this.validateAssignedTo(toId, lang) : null;
        const fromUser = prospect.assignedToId
            ? await this.userRepo.findOne({ where: { id: prospect.assignedToId }, select: ['id', 'fullName'] })
            : null;

        prospect.assignedToId = toId ?? undefined;
        prospect.assignedById = user?.id ?? null;
        prospect.assignedAt = new Date();
        const saved = await this.prospectRepo.save(prospect);

        const type = await this.tracking.logAssignment({ prospect: saved, fromUser, toUser, by: user, note: dto.note });
        await this.tracking.log({
            prospect: saved,
            action: type as any,
            user,
            note: dto.note ?? null,
            metadata: { fromUserId: fromUser?.id ?? null, fromUserName: fromUser?.fullName ?? null, toUserId: toUser?.id ?? null, toUserName: toUser?.fullName ?? null },
        });

        const key = !toUser ? 'prospect.unassigned_success' : fromUser ? 'prospect.transferred_success' : 'prospect.assigned_success';
        return {
            message: await this.i18nService.translate(key, lang, { name: saved.fullName, to: toUser?.fullName ?? '', from: fromUser?.fullName ?? '' }),
            data: saved,
        };
    }

    async bulkAssign(dto: BulkAssignProspectsDto, user: ProspectActor, lang: string = 'fr') {
        if (dto.toUserId) await this.validateAssignedTo(dto.toUserId, lang);
        const done: string[] = [];
        const failed: { id: string; error: string }[] = [];
        for (const id of [...new Set(dto.prospectIds)]) {
            try {
                await this.assign(id, { toUserId: dto.toUserId, note: dto.note }, user, lang);
                done.push(id);
            } catch (e: any) {
                failed.push({ id, error: e?.response?.message ?? e?.message });
            }
        }
        return {
            message: await this.i18nService.translate('prospect.bulk_assigned', lang, { count: done.length, failed: failed.length }),
            data: { done, failed },
        };
    }

    // ============================================================
    // 🔗 COMPTE EXISTANT
    // ============================================================
    /** Compte rattaché ou compte(s) correspondant(s) au téléphone / e-mail */
    async account(id: string, user: ProspectActor, lang: string = 'fr') {
        const prospect = await this.getRaw(id, lang);
        const full = this.tracking.isAdmin(user);
        const linked = prospect.linkedUserId
            ? (await this.prospectRepo.query(
                'SELECT id, fullName, email, phone, image, role, isActive, city, country, createdAt FROM users WHERE id = ?',
                [prospect.linkedUserId],
            ))[0] ?? null
            : null;
        const found = await this.tracking.findDuplicates({ phone: prospect.phone, email: prospect.email, excludeProspectId: id });
        const customer = await this.customerRepo
            .createQueryBuilder('c')
            .where(linked ? 'c.userId = :uid' : '1 = 0', { uid: linked?.id })
            .getOne()
            .catch(() => null);
        return {
            message: await this.i18nService.translate(linked || found.users.length ? 'prospect.account_exists' : 'prospect.no_account', lang, {
                name: linked?.fullName ?? found.users[0]?.fullName ?? '',
            }),
            data: {
                linkedAccount: this.tracking.accountView(linked, full),
                matchingAccounts: found.users.filter((u) => u.id !== linked?.id).map((u) => this.tracking.accountView(u, full)),
                customer: customer ? { id: customer.id, fullName: customer.fullName, status: customer.status } : null,
                otherProspects: found.prospects.map((p) => ({ id: p.id, fullName: p.fullName, status: p.status, assignedToName: p.assignedToName ?? null })),
            },
        };
    }

    async linkAccount(id: string, dto: LinkProspectAccountDto, user: ProspectActor, lang: string = 'fr') {
        const prospect = await this.getRaw(id, lang);
        let target: any = null;
        if (dto.userId) {
            target = (await this.prospectRepo.query('SELECT id, fullName, phone, email FROM users WHERE id = ? AND deleted = 0', [dto.userId]))[0];
            if (!target) throw new NotFoundException(await this.i18nService.translate('prospect.account_not_found', lang));
            // Un agent ne peut rattacher qu'un compte qui correspond au téléphone / e-mail ; un administrateur, n'importe lequel
            if (!this.tracking.isAdmin(user)) {
                const sameTail = this.tracking.phoneTail(target.phone) && this.tracking.phoneTail(target.phone) === this.tracking.phoneTail(prospect.phone);
                const sameEmail = target.email && prospect.email && String(target.email).toLowerCase() === String(prospect.email).toLowerCase();
                if (!sameTail && !sameEmail) throw new BadRequestException(await this.i18nService.translate('prospect.account_mismatch', lang));
            }
        } else {
            const found = await this.tracking.findDuplicates({ phone: prospect.phone, email: prospect.email });
            target = found.users[0] ?? null;
            if (!target) throw new NotFoundException(await this.i18nService.translate('prospect.no_account', lang));
        }
        const previous = prospect.linkedUserId ?? null;
        prospect.linkedUserId = target.id;
        prospect.linkedAt = new Date();
        const saved = await this.prospectRepo.save(prospect);
        await this.tracking.log({ prospect: saved, action: ProspectHistoryAction.ACCOUNT_LINKED, user, metadata: { userId: target.id, userName: target.fullName, previousUserId: previous } });
        return { message: await this.i18nService.translate('prospect.account_linked', lang, { name: saved.fullName, account: target.fullName }), data: saved };
    }

    async unlinkAccount(id: string, user: ProspectActor, lang: string = 'fr') {
        const prospect = await this.getRaw(id, lang);
        if (!prospect.linkedUserId) return { message: await this.i18nService.translate('prospect.no_account', lang), data: prospect };
        const previous = prospect.linkedUserId;
        prospect.linkedUserId = null;
        prospect.linkedAt = null;
        const saved = await this.prospectRepo.save(prospect);
        await this.tracking.log({ prospect: saved, action: ProspectHistoryAction.ACCOUNT_UNLINKED, user, metadata: { userId: previous } });
        return { message: await this.i18nService.translate('prospect.account_unlinked', lang, { name: saved.fullName }), data: saved };
    }

    // ============================================================
    // 🕓 HISTORIQUE D'UN PROSPECT
    // ============================================================
    async history(id: string, lang: string = 'fr') {
        const [history, assignments] = await Promise.all([
            this.historyRepo.find({ where: { prospectId: id }, order: { createdAt: 'DESC' }, take: 500 }).catch(() => []),
            this.assignmentRepo.find({ where: { prospectId: id }, order: { createdAt: 'DESC' }, take: 200 }).catch(() => []),
        ]);
        const prospect = await this.prospectRepo.findOne({ where: { id }, select: ['id', 'fullName', 'status', 'assignedToId', 'createdById', 'createdAt'] });
        if (!prospect && !history.length) throw new NotFoundException(await this.i18nService.translate('prospect.not_found_by_id', lang, { id }));
        return {
            message: await this.i18nService.translate('prospect.history_retrieved', lang),
            data: {
                prospect: prospect ?? { id, deleted: true, fullName: history[0]?.prospectName ?? null },
                history,
                assignments,
                responsibles: assignments.length,
            },
        };
    }

    // ============================================================
    // 🗑️ SUPPRIMER
    // ============================================================
    async remove(
        id: string,
        lang: string = 'fr',
        user?: ProspectActor,
    ): Promise<{ message: string }> {
        const prospect = await this.getRaw(id, lang);
        await this.tracking.log({
            prospect,
            action: ProspectHistoryAction.DELETED,
            user,
            oldStatus: prospect.status,
            metadata: { phone: prospect.phone ?? null, email: prospect.email ?? null, assignedToId: prospect.assignedToId ?? null, createdById: prospect.createdById ?? null },
        });
        await this.prospectRepo.remove(prospect);

        return {
            message: await this.i18nService.translate('prospect.deleted_success', lang, {
                name: prospect.fullName,
            }),
        };
    }

    // ============================================================
    // 🔄 CONVERTIR EN CLIENT (jamais de deuxième compte)
    // ============================================================
    async convertToCustomer(
        prospectId: string,
        dto: ConvertProspectDto,
        lang: string = 'fr',
        actor?: ProspectActor,
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
            existingAccount?: boolean;
        };
    }> {
        const prospect = await this.getRaw(prospectId, lang);
        const oldStatus = prospect.status;

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
        const DEFAULT_CLIENT_PASSWORD = process.env.DEFAULT_CLIENT_PASSWORD || 'FavorHelp@2025';

        if (dto.createUserAccount !== false) {
            // ✅ 1) compte choisi, 2) compte rattaché, 3) compte trouvé par téléphone (tous formats) / e-mail
            let existing: UserEntity | null = null;
            const existingId =
                dto.existingUserId ||
                prospect.linkedUserId ||
                (await this.tracking.findDuplicates({ phone: prospect.phone, email: prospect.email })).users[0]?.id;
            if (existingId) existing = await this.userRepo.findOne({ where: { id: existingId } });
            if (dto.existingUserId && !existing) {
                throw new NotFoundException(await this.i18nService.translate('prospect.account_not_found', lang));
            }

            if (existing) {
                user = existing;
                existingUserReused = true;
                this.logger.log(`[convertToCustomer] Compte existant utilisé (pas de doublon) : ${user.id}`);
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
                    country: prospect.countryName || undefined,
                    city: prospect.cityName || undefined,
                });

                const created = await this.userRepo.save(newUser);
                user = created;

                const referralCodeGenerated = await this.generateReferralCode(created.id);
                created.referralCode = referralCodeGenerated;
                await this.userRepo.save(created);

                this.logger.log(`✅ [convertToCustomer] User créé: ${created.id} avec referralCode: ${referralCodeGenerated}`);

                const loyalty = await this.getOrCreateLoyaltyAccount(created.id);
                await this.loyaltyRepo.save(loyalty);
            }
        }

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

        prospect.status = ProspectStatus.WON;
        this.applyStatusDates(prospect, oldStatus, ProspectStatus.WON);
        if (user && !prospect.linkedUserId) {
            prospect.linkedUserId = user.id;
            prospect.linkedAt = new Date();
        }
        const updatedProspect = await this.prospectRepo.save(prospect);

        await this.tracking.log({
            prospect: updatedProspect,
            action: ProspectHistoryAction.CONVERTED,
            user: actor,
            oldStatus,
            newStatus: ProspectStatus.WON,
            metadata: { customerId: savedCustomer.id, userId: user?.id ?? null, existingAccount: existingUserReused },
        });
        if (oldStatus === ProspectStatus.NEW) {
            await this.tracking.log({ prospect: updatedProspect, action: ProspectHistoryAction.PROCESSED, user: actor, oldStatus, newStatus: ProspectStatus.WON });
        }

        // 📱 SMS de bienvenue (seulement pour un compte créé : un compte existant garde son mot de passe)
        if (user && dto.createUserAccount !== false) {
            if (existingUserReused) {
                smsSkipped = true;
                smsSkipReason = 'User existant réutilisé (pas de nouveau mot de passe)';
            } else if (!user.phone || user.phone.trim() === '') {
                smsSkipped = true;
                smsSkipReason = 'Aucun numéro de téléphone';
            } else if (!rawPassword) {
                smsSkipped = true;
                smsSkipReason = 'Mot de passe non disponible';
            } else {
                try {
                    const smsMessage = await this.i18nService.translate('prospect.welcome_sms_converted', lang, {
                        fullName: user.fullName,
                        phone: user.phone,
                        password: rawPassword,
                        referralCode: user.referralCode || 'N/A',
                        appUrl: 'https://favorhelp.com',
                        playStoreUrl: 'https://play.google.com/store/apps/details?id=com.favor_help&hl=fr',
                        appStoreUrl: 'https://apps.apple.com/cg/app/favor-help/id6757249867?l=fr-FR',
                    });
                    smsSent = await this.smsService.sendSms(user.phone, smsMessage);
                    if (!smsSent) this.logger.warn(`[convertToCustomer] Échec SMS à ${user.phone}`);
                } catch (error: any) {
                    this.logger.error(`[convertToCustomer] Erreur SMS: ${error.message}`);
                    smsSent = false;
                }
            }
        }

        const responseData: any = {
            prospect: updatedProspect,
            customer: savedCustomer,
            user,
            smsSent,
            existingAccount: existingUserReused,
        };
        if (defaultPasswordUsed) responseData.defaultPasswordUsed = true;
        if (smsSkipped) {
            responseData.smsSkipped = true;
            responseData.smsSkipReason = smsSkipReason;
        }

        return {
            message: existingUserReused
                ? await this.i18nService.translate('prospect.converted_existing_account', lang, { name: prospect.fullName, account: user?.fullName ?? '' })
                : await this.i18nService.translate('prospect.converted_success', lang, { name: prospect.fullName }),
            data: responseData,
        };
    }
}
