import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Brackets, DataSource, Repository } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { CensusRecordEntity } from './entities/census-record.entity';
import { CensusFollowupEntity } from './entities/census-followup.entity';
import { CreateCensusDto, CreateFollowupDto, ImportInactiveDto, QueryCensusDto, UpdateCensusDto } from './dto/census.dto';
import { CensusResult, CensusSource, CensusStatus, CensusType } from '../common/enums/census.enum';

const DAY = 24 * 3600 * 1000;
/** Statuts encore « à suivre » (relance prévue) */
const OPEN: CensusStatus[] = [CensusStatus.TO_CONTACT, CensusStatus.CONTACTED, CensusStatus.INTERESTED, CensusStatus.UNREACHABLE];

/**
 * ✅ RECENSEMENT DES CLIENTS ET VENDEURS EXISTANTS — pour relancer les anciens clients
 *
 *  - Fiche de recensement (terrain, téléphone, ou créée depuis les anciens clients / vendeurs de la plateforme)
 *  - Toujours à partir d'un CLIENT existant (users) ou d'une ENTREPRISE existante (company) : identité reprise
 *    de la plateforme + activité réelle (commandes, ventes)
 *  - Relances (appel, SMS, WhatsApp, visite…) avec résultat et date de rappel
 *  - Statistiques : à relancer aujourd'hui, intéressés, revenus (réactivés), par agent
 *  - Chaque nuit : une fiche dont le client / vendeur a de nouveau commandé / vendu passe en REACTIVATED
 */
@Injectable()
export class CensusService {
    private readonly logger = new Logger(CensusService.name);

    constructor(
        @InjectRepository(CensusRecordEntity) private readonly recordRepo: Repository<CensusRecordEntity>,
        @InjectRepository(CensusFollowupEntity) private readonly followupRepo: Repository<CensusFollowupEntity>,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly i18n: I18nService,
    ) { }

    private t(key: string, lang: string, params?: Record<string, any>): string {
        return this.i18n.translate(key, lang, params) as any;
    }

    private q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
        return this.dataSource.query(sql, params);
    }

    private toDate(v?: string | null): Date | null {
        if (!v) return null;
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    // ============================================================
    // LIEN AVEC LA PLATEFORME
    // ============================================================
    /**
     * Client / entreprise EXISTANT sur la plateforme : obligatoire, identité reprise du compte / de l'entreprise.
     *   CLIENT → userId (users)          VENDOR → vendorCompanyId (company) + son propriétaire
     */
    private async loadIdentity(type: CensusType, userId: string | null | undefined, vendorCompanyId: string | null | undefined, lang: string) {
        if (type === CensusType.CLIENT) {
            if (!userId) throw new BadRequestException(this.t('census.client_required', lang));
            const u = await this.q('SELECT id, fullName, phone, email FROM users WHERE id = ? LIMIT 1', [userId]);
            if (!u[0]) throw new NotFoundException(this.t('census.client_not_found', lang));
            return { userId: u[0].id, vendorCompanyId: null, fullName: u[0].fullName || '-', phone: u[0].phone ?? null, email: u[0].email ?? null, businessName: null, cityId: null, activity: null };
        }
        if (!vendorCompanyId) throw new BadRequestException(this.t('census.company_required', lang));
        const c = await this.q(
            `SELECT c.id, c.companyName, c.cityId, c.typeCompany,
                    (SELECT uhc.userId FROM user_has_company uhc WHERE uhc.companyId = c.id ORDER BY uhc.isOwner DESC LIMIT 1) AS ownerId
               FROM company c WHERE c.id = ? LIMIT 1`,
            [vendorCompanyId],
        );
        if (!c[0]) throw new NotFoundException(this.t('census.company_not_found', lang));
        const ownerId = c[0].ownerId ?? null;
        const owner = ownerId ? (await this.q('SELECT fullName, phone, email FROM users WHERE id = ? LIMIT 1', [ownerId]))[0] : null;
        return {
            userId: ownerId,
            vendorCompanyId: c[0].id,
            fullName: owner?.fullName || c[0].companyName || '-',
            phone: owner?.phone ?? null,
            email: owner?.email ?? null,
            businessName: c[0].companyName ?? null,
            cityId: c[0].cityId ?? null,
            activity: c[0].typeCompany ?? null,
        };
    }

    /** Activité réelle sur la plateforme (commandes, colis, courses / ventes, produits) */
    private async platformActivity(record: CensusRecordEntity) {
        const out: Record<string, any> = { linked: !!(record.userId || record.vendorCompanyId) };
        if (record.userId) {
            const [orders, money, others] = await Promise.all([
                this.q(
                    `SELECT COUNT(*) AS orders, MAX(createdAt) AS lastOrderAt, MIN(createdAt) AS firstOrderAt
                       FROM orders WHERE userId = ? AND status <> 'REJECTED' AND cancelledAt IS NULL`,
                    [record.userId],
                ),
                this.q(
                    `SELECT currency, SUM(totalAmount) AS amount FROM orders
                      WHERE userId = ? AND status <> 'REJECTED' AND cancelledAt IS NULL GROUP BY currency`,
                    [record.userId],
                ),
                Promise.all([
                    this.q('SELECT COUNT(*) AS n, MAX(createdAt) AS last FROM shipments WHERE userId = ?', [record.userId]).catch((): any[] => []),
                    this.q('SELECT COUNT(*) AS n, MAX(createdAt) AS last FROM rides WHERE riderId = ?', [record.userId]).catch((): any[] => []),
                ]),
            ]);
            const [ship, rides] = others;
            const spent: Record<string, number> = {};
            for (const m of money) spent[m.currency || 'N/A'] = Math.round(Number(m.amount || 0) * 100) / 100;
            out.customer = {
                orders: Number(orders[0]?.orders || 0),
                firstOrderAt: orders[0]?.firstOrderAt ?? null,
                lastOrderAt: orders[0]?.lastOrderAt ?? null,
                totalSpent: spent,
                shipments: Number(ship?.[0]?.n || 0),
                lastShipmentAt: ship?.[0]?.last ?? null,
                rides: Number(rides?.[0]?.n || 0),
                lastRideAt: rides?.[0]?.last ?? null,
            };
        }
        if (record.vendorCompanyId) {
            const [company, sales, products] = await Promise.all([
                this.q('SELECT id, companyName, typeCompany, status FROM company WHERE id = ?', [record.vendorCompanyId]),
                this.q(
                    `SELECT COUNT(DISTINCT o.id) AS orders, MAX(o.createdAt) AS lastSaleAt
                       FROM sub_orders so JOIN orders o ON o.id = so.orderId
                      WHERE so.companyId = ? AND o.status <> 'REJECTED' AND o.cancelledAt IS NULL`,
                    [record.vendorCompanyId],
                ),
                this.q('SELECT COUNT(*) AS n FROM products WHERE companyId = ?', [record.vendorCompanyId]),
            ]);
            out.vendor = {
                company: company[0] ?? null,
                salesOrders: Number(sales[0]?.orders || 0),
                lastSaleAt: sales[0]?.lastSaleAt ?? null,
                products: Number(products[0]?.n || 0),
            };
        }
        // Vendeur : seulement ses ventes ; client : commandes, colis, courses
        const dates = (record.type === CensusType.VENDOR
            ? [out.vendor?.lastSaleAt]
            : [out.customer?.lastOrderAt, out.customer?.lastShipmentAt, out.customer?.lastRideAt])
            .filter(Boolean)
            .map((d) => new Date(d).getTime());
        out.lastActivityAt = dates.length ? new Date(Math.max(...dates)) : null;
        const last = out.lastActivityAt ?? record.lastActivityAt;
        out.inactiveDays = last ? Math.floor((Date.now() - new Date(last).getTime()) / DAY) : null;
        return out;
    }

    // ============================================================
    // CRUD
    // ============================================================
    async create(dto: CreateCensusDto, actor: UserEntity, lang = 'fr') {
        const who = await this.loadIdentity(dto.type, dto.userId, dto.vendorCompanyId, lang);

        // Une seule fiche par client / par entreprise
        const dup = await this.findDuplicate(dto.type, who.userId, who.vendorCompanyId);
        if (dup) throw new ConflictException({ message: this.t('census.duplicate', lang), existingId: dup.id });

        // Dernière activité réelle sur la plateforme (sinon celle déclarée)
        const activity = await this.platformActivity({ userId: who.userId, vendorCompanyId: who.vendorCompanyId, type: dto.type } as any).catch(() => null);

        const record = this.recordRepo.create({
            ...dto,
            // Identité reprise du compte / de l'entreprise (modifiable seulement pour compléter)
            fullName: dto.fullName || who.fullName,
            businessName: dto.businessName ?? who.businessName ?? undefined,
            phone: dto.phone ?? who.phone ?? undefined,
            email: dto.email ?? who.email ?? undefined,
            cityId: dto.cityId ?? who.cityId ?? undefined,
            activity: dto.activity ?? who.activity ?? undefined,
            userId: who.userId ?? undefined,
            vendorCompanyId: who.vendorCompanyId ?? undefined,
            lastActivityAt: activity?.lastActivityAt ?? this.toDate(dto.lastActivityAt),
            nextFollowUpAt: this.toDate(dto.nextFollowUpAt) ?? new Date(),
            consent: dto.consent ?? true,
            contactCount: 0,
            source: dto.source ?? CensusSource.FIELD,
            status: dto.status ?? CensusStatus.TO_CONTACT,
            recordedById: actor?.id,
            assignedToId: dto.assignedToId ?? actor?.id,
        } as any);
        const saved: CensusRecordEntity = await this.recordRepo.save(record as any);
        return { message: this.t('census.created', lang), data: await this.detail(saved.id) };
    }

    /** Fiche existante pour ce client (CLIENT) ou cette entreprise (VENDOR) */
    private async findDuplicate(type: CensusType, userId?: string | null, vendorCompanyId?: string | null, exceptId?: string) {
        const qb = this.recordRepo.createQueryBuilder('r').where('r.type = :type', { type });
        if (type === CensusType.CLIENT) {
            if (!userId) return null;
            qb.andWhere('r.userId = :userId', { userId });
        } else {
            if (!vendorCompanyId) return null;
            qb.andWhere('r.vendorCompanyId = :vc', { vc: vendorCompanyId });
        }
        if (exceptId) qb.andWhere('r.id <> :exceptId', { exceptId });
        return qb.getOne();
    }

    // ============================================================
    // CLIENTS / ENTREPRISES EXISTANTS À RECENSER
    // ============================================================
    /**
     * Liste des clients (users ayant déjà commandé) ou des entreprises existants, avec leur activité
     * et leur fiche de recensement (null = pas encore recensé). C'est ici qu'on choisit qui recenser.
     */
    async candidates(
        query: { type?: string; search?: string; inactiveDays?: number; withoutRecord?: string; cityId?: string; page?: number; limit?: number },
        lang = 'fr',
    ) {
        const type = String(query.type || CensusType.CLIENT).toUpperCase() === CensusType.VENDOR ? CensusType.VENDOR : CensusType.CLIENT;
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.min(200, Math.max(1, Number(query.limit) || 20));
        const search = query.search?.trim() ? `%${query.search.trim()}%` : null;
        const cutoff = query.inactiveDays ? new Date(Date.now() - Number(query.inactiveDays) * DAY) : null;
        const withoutRecord = String(query.withoutRecord || '').toLowerCase() === 'true';

        let inner: string;
        const params: any[] = [];
        if (type === CensusType.CLIENT) {
            inner = `SELECT u.id AS id, u.fullName AS name, NULL AS businessName, u.phone AS phone, u.email AS email,
                            u.image AS image, NULL AS logo,
                            NULL AS cityId, NULL AS companyType, u.createdAt AS createdAt,
                            (SELECT COUNT(*) FROM orders o WHERE o.userId = u.id AND o.status <> 'REJECTED' AND o.cancelledAt IS NULL) AS orders,
                            (SELECT MAX(o.createdAt) FROM orders o WHERE o.userId = u.id AND o.status <> 'REJECTED' AND o.cancelledAt IS NULL) AS lastActivityAt,
                            (SELECT cr.id FROM census_records cr WHERE cr.type = 'CLIENT' AND cr.userId = u.id LIMIT 1) AS recordId,
                            (SELECT cr.status FROM census_records cr WHERE cr.type = 'CLIENT' AND cr.userId = u.id LIMIT 1) AS recordStatus
                       FROM users u
                      WHERE EXISTS (SELECT 1 FROM orders o WHERE o.userId = u.id)`;
            if (search) {
                inner += ' AND (u.fullName LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)';
                params.push(search, search, search);
            }
        } else {
            inner = `SELECT c.id AS id, c.companyName AS name, c.companyName AS businessName,
                            (SELECT u.phone FROM user_has_company uhc JOIN users u ON u.id = uhc.userId
                              WHERE uhc.companyId = c.id ORDER BY uhc.isOwner DESC LIMIT 1) AS phone,
                            (SELECT u.image FROM user_has_company uhc JOIN users u ON u.id = uhc.userId
                              WHERE uhc.companyId = c.id ORDER BY uhc.isOwner DESC LIMIT 1) AS image,
                            c.logo AS logo,
                            NULL AS email, c.cityId AS cityId, c.typeCompany AS companyType, c.createdAt AS createdAt,
                            (SELECT COUNT(DISTINCT so.orderId) FROM sub_orders so WHERE so.companyId = c.id) AS orders,
                            (SELECT MAX(o.createdAt) FROM sub_orders so JOIN orders o ON o.id = so.orderId
                              WHERE so.companyId = c.id AND o.status <> 'REJECTED' AND o.cancelledAt IS NULL) AS lastActivityAt,
                            (SELECT cr.id FROM census_records cr WHERE cr.type = 'VENDOR' AND cr.vendorCompanyId = c.id LIMIT 1) AS recordId,
                            (SELECT cr.status FROM census_records cr WHERE cr.type = 'VENDOR' AND cr.vendorCompanyId = c.id LIMIT 1) AS recordStatus
                       FROM company c WHERE 1 = 1`;
            if (search) {
                inner += ' AND c.companyName LIKE ?';
                params.push(search);
            }
            if (query.cityId) {
                inner += ' AND c.cityId = ?';
                params.push(query.cityId);
            }
        }
        const outer: string[] = [];
        const outerParams: any[] = [];
        if (cutoff) {
            // Inactif : dernière activité avant la date, ou aucune activité (et inscrit avant la date)
            outer.push('(x.lastActivityAt < ? OR (x.lastActivityAt IS NULL AND x.createdAt < ?))');
            outerParams.push(cutoff, cutoff);
        }
        if (withoutRecord) outer.push('x.recordId IS NULL');
        const where = outer.length ? `WHERE ${outer.join(' AND ')}` : '';

        const [rows, total] = await Promise.all([
            this.q(
                `SELECT x.* FROM (${inner}) x ${where}
                  ORDER BY x.orders DESC, x.lastActivityAt DESC LIMIT ? OFFSET ?`,
                [...params, ...outerParams, limit, (page - 1) * limit],
            ),
            this.q(`SELECT COUNT(*) AS total FROM (${inner}) x ${where}`, [...params, ...outerParams]),
        ]);
        const now = Date.now();
        const data = rows.map((r) => ({
            type,
            userId: type === CensusType.CLIENT ? r.id : null,
            vendorCompanyId: type === CensusType.VENDOR ? r.id : null,
            name: r.name,
            businessName: r.businessName,
            phone: r.phone,
            email: r.email,
            // ✅ Photos : client = photo du compte ; vendeur = logo de l'entreprise + photo du propriétaire
            image: r.image ?? null,
            logo: r.logo ?? null,
            photo: (type === CensusType.VENDOR ? r.logo || r.image : r.image) ?? null,
            cityId: r.cityId,
            companyType: r.companyType,
            orders: Number(r.orders || 0),
            lastActivityAt: r.lastActivityAt,
            inactiveDays: r.lastActivityAt ? Math.floor((now - new Date(r.lastActivityAt).getTime()) / DAY) : null,
            /** Fiche de recensement existante (null = pas encore recensé) */
            record: r.recordId ? { id: r.recordId, status: r.recordStatus } : null,
        }));
        return {
            message: this.t('census.candidates', lang),
            data: new PaginatedResponseDto<any>(data, Number(total[0]?.total || 0), page, limit),
        };
    }

    async findAll(query: QueryCensusDto, lang = 'fr') {
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.min(200, Math.max(1, Number(query.limit) || 20));
        const qb = this.recordRepo
            .createQueryBuilder('r')
            .leftJoinAndSelect('r.city', 'city')
            .leftJoin('r.assignedTo', 'agent')
            .addSelect(['agent.id', 'agent.fullName', 'agent.phone', 'agent.image']);
        this.joinPhotos(qb);

        if (query.type) qb.andWhere('r.type = :type', { type: query.type });
        if (query.status) qb.andWhere('r.status = :status', { status: query.status });
        if (query.cityId) qb.andWhere('r.cityId = :cityId', { cityId: query.cityId });
        if (query.assignedToId) qb.andWhere('r.assignedToId = :agent', { agent: query.assignedToId });
        if (String(query.due || '').toLowerCase() === 'true') {
            qb.andWhere('r.nextFollowUpAt <= :now', { now: new Date() }).andWhere('r.status IN (:...open)', { open: OPEN });
        }
        if (query.inactiveDays) {
            qb.andWhere('r.lastActivityAt <= :limitDate', { limitDate: new Date(Date.now() - Number(query.inactiveDays) * DAY) });
        }
        if (query.search?.trim()) {
            const s = `%${query.search.trim()}%`;
            qb.andWhere(
                new Brackets((w) =>
                    w
                        .where('r.fullName LIKE :s', { s })
                        .orWhere('r.businessName LIKE :s', { s })
                        .orWhere('r.phone LIKE :s', { s })
                        .orWhere('r.activity LIKE :s', { s })
                        .orWhere('r.district LIKE :s', { s }),
                ),
            );
        }
        // ✅ offset/limit (et non skip/take) : les jointures sont ManyToOne (pas de doublons), et TypeORM
        //    refuse une expression (CASE WHEN …) dans le tri quand skip/take sont utilisés avec des jointures.
        const [items, total] = await qb
            .orderBy('CASE WHEN r.nextFollowUpAt IS NULL THEN 1 ELSE 0 END', 'ASC')
            .addOrderBy('r.nextFollowUpAt', 'ASC')
            .addOrderBy('r.createdAt', 'DESC')
            .addOrderBy('r.id', 'ASC')
            .offset((page - 1) * limit)
            .limit(limit)
            .getManyAndCount();

        const now = Date.now();
        const data = items.map((r) => ({
            ...r,
            ...this.photosOf(r),
            inactiveDays: r.lastActivityAt ? Math.floor((now - new Date(r.lastActivityAt).getTime()) / DAY) : null,
            overdue: !!(r.nextFollowUpAt && new Date(r.nextFollowUpAt).getTime() <= now && OPEN.includes(r.status)),
        }));
        return { message: this.t('census.list', lang), data: new PaginatedResponseDto<any>(data, total, page, limit) };
    }

    private async detail(id: string) {
        const record = await this.recordRepo
            .createQueryBuilder('r')
            .leftJoinAndSelect('r.city', 'city')
            .leftJoin('r.assignedTo', 'agent')
            .addSelect(['agent.id', 'agent.fullName', 'agent.phone', 'agent.image'])
            .leftJoin('r.recordedBy', 'recorder')
            .addSelect(['recorder.id', 'recorder.fullName', 'recorder.image'])
            .leftJoin('r.user', 'person')
            .addSelect(['person.id', 'person.fullName', 'person.phone', 'person.image'])
            .leftJoin('r.vendorCompany', 'vendor')
            .addSelect(['vendor.id', 'vendor.companyName', 'vendor.logo'])
            .where('r.id = :id', { id })
            .getOne();
        if (!record) return null;
        const followups = await this.followupRepo
            .createQueryBuilder('f')
            .leftJoin('f.createdBy', 'by')
            .addSelect(['by.id', 'by.fullName', 'by.image'])
            .where('f.recordId = :id', { id })
            .orderBy('f.createdAt', 'DESC')
            .getMany();
        const platform = await this.platformActivity(record).catch((e) => {
            this.logger.warn(`Activité plateforme (fiche ${id}) : ${e?.message}`);
            return null;
        });
        return { ...record, ...this.photosOf(record), followups, platform };
    }

    /** ✅ Jointures du compte (photo) et de l'entreprise (logo) de la fiche */
    private joinPhotos(qb: any) {
        return qb
            .leftJoin('r.user', 'person')
            .addSelect(['person.id', 'person.fullName', 'person.phone', 'person.image'])
            .leftJoin('r.vendorCompany', 'vendor')
            .addSelect(['vendor.id', 'vendor.companyName', 'vendor.logo']);
    }

    /** ✅ image = photo du compte ; logo = logo de l'entreprise ; photo = celle à afficher */
    private photosOf(r: CensusRecordEntity) {
        const image = (r.user as any)?.image ?? null;
        const logo = (r.vendorCompany as any)?.logo ?? null;
        return { image, logo, photo: (r.type === CensusType.VENDOR ? logo || image : image) ?? null };
    }

    async findOne(id: string, lang = 'fr') {
        const data = await this.detail(id);
        if (!data) throw new NotFoundException(this.t('census.not_found', lang));
        return { message: this.t('census.found', lang), data };
    }

    async update(id: string, dto: UpdateCensusDto, lang = 'fr') {
        const record = await this.recordRepo.findOne({ where: { id } });
        if (!record) throw new NotFoundException(this.t('census.not_found', lang));

        // Le client / l'entreprise de la fiche ne change pas (une autre fiche = un autre recensement)
        const { type: _t, userId: _u, vendorCompanyId: _v, ...rest } = dto as any;
        const merged: any = { ...record, ...rest };
        if (dto.lastActivityAt !== undefined) merged.lastActivityAt = this.toDate(dto.lastActivityAt);
        if (dto.nextFollowUpAt !== undefined) merged.nextFollowUpAt = this.toDate(dto.nextFollowUpAt);

        await this.recordRepo.save(merged);
        return { message: this.t('census.updated', lang), data: await this.detail(id) };
    }

    async remove(id: string, lang = 'fr') {
        const record = await this.recordRepo.findOne({ where: { id } });
        if (!record) throw new NotFoundException(this.t('census.not_found', lang));
        await this.recordRepo.remove(record);
        return { message: this.t('census.deleted', lang), data: { id } };
    }

    // ============================================================
    // RELANCES
    // ============================================================
    async addFollowup(id: string, dto: CreateFollowupDto, actor: UserEntity, lang = 'fr') {
        const record = await this.recordRepo.findOne({ where: { id } });
        if (!record) throw new NotFoundException(this.t('census.not_found', lang));

        // Date de rappel par défaut selon le résultat
        const defaults: Partial<Record<CensusResult, number>> = {
            [CensusResult.NOT_REACHED]: 1,
            [CensusResult.CALL_BACK]: 1,
            [CensusResult.REACHED]: 7,
            [CensusResult.INTERESTED]: 3,
        };
        const next =
            this.toDate(dto.nextFollowUpAt) ?? (defaults[dto.result] ? new Date(Date.now() + defaults[dto.result]! * DAY) : null);

        const status: Record<CensusResult, CensusStatus> = {
            [CensusResult.REACHED]: CensusStatus.CONTACTED,
            [CensusResult.CALL_BACK]: CensusStatus.CONTACTED,
            [CensusResult.NOT_REACHED]: CensusStatus.UNREACHABLE,
            [CensusResult.INTERESTED]: CensusStatus.INTERESTED,
            [CensusResult.NOT_INTERESTED]: CensusStatus.NOT_INTERESTED,
            [CensusResult.REACTIVATED]: CensusStatus.REACTIVATED,
        };

        await this.dataSource.transaction(async (m) => {
            await m.save(
                CensusFollowupEntity,
                m.create(CensusFollowupEntity, {
                    recordId: id,
                    channel: dto.channel,
                    result: dto.result,
                    note: dto.note,
                    nextFollowUpAt: next ?? undefined,
                    createdById: actor?.id,
                } as any),
            );
            await m.update(CensusRecordEntity, { id }, {
                status: status[dto.result],
                lastContactAt: new Date(),
                contactCount: () => 'contactCount + 1',
                nextFollowUpAt: next,
            } as any);
        });
        return { message: this.t('census.followup_saved', lang), data: await this.detail(id) };
    }

    // ============================================================
    // ANCIENS CLIENTS / VENDEURS DE LA PLATEFORME → FICHES
    // ============================================================
    /**
     * Crée les fiches « à relancer » des clients (ou vendeurs) sans activité depuis N jours,
     * qui n'ont pas encore de fiche. Les plus importants d'abord (nombre de commandes / ventes).
     */
    async importInactive(dto: ImportInactiveDto, actor: UserEntity, lang = 'fr') {
        const days = Number(dto.inactiveDays || 90);
        const limit = Math.min(1000, Number(dto.limit || 200));
        const cutoff = new Date(Date.now() - days * DAY);
        let rows: any[];

        if (dto.type === CensusType.CLIENT) {
            rows = await this.q(
                `SELECT u.id AS userId, u.fullName AS fullName, u.phone AS phone, u.email AS email,
                        MAX(o.createdAt) AS lastActivityAt, COUNT(o.id) AS orders
                   FROM users u
                   JOIN orders o ON o.userId = u.id AND o.status <> 'REJECTED' AND o.cancelledAt IS NULL
                  WHERE NOT EXISTS (SELECT 1 FROM census_records cr WHERE cr.type = 'CLIENT' AND cr.userId = u.id)
                  GROUP BY u.id, u.fullName, u.phone, u.email
                 HAVING MAX(o.createdAt) < ?
                  ORDER BY orders DESC, lastActivityAt DESC
                  LIMIT ?`,
                [cutoff, limit],
            );
        } else {
            const params: any[] = [cutoff];
            let city = '';
            if (dto.cityId) {
                city = 'AND c.cityId = ?';
                params.push(dto.cityId);
            }
            params.push(cutoff, limit);
            rows = await this.q(
                `SELECT v.*, u.fullName AS fullName, u.phone AS phone, u.email AS email
                   FROM (
                    SELECT c.id AS vendorCompanyId, c.companyName AS businessName, c.cityId AS cityId, c.typeCompany AS activity,
                           (SELECT MAX(o.createdAt) FROM sub_orders so JOIN orders o ON o.id = so.orderId
                             WHERE so.companyId = c.id AND o.status <> 'REJECTED' AND o.cancelledAt IS NULL) AS lastActivityAt,
                           (SELECT COUNT(DISTINCT so.orderId) FROM sub_orders so WHERE so.companyId = c.id) AS orders,
                           (SELECT uhc.userId FROM user_has_company uhc WHERE uhc.companyId = c.id
                             ORDER BY uhc.isOwner DESC LIMIT 1) AS userId
                      FROM company c
                     WHERE c.status = 'VALIDATED' AND c.createdAt < ? ${city}
                       AND NOT EXISTS (SELECT 1 FROM census_records cr WHERE cr.type = 'VENDOR' AND cr.vendorCompanyId = c.id)
                 ) v
                 LEFT JOIN users u ON u.id = v.userId
                 WHERE v.lastActivityAt IS NULL OR v.lastActivityAt < ?
                 ORDER BY v.orders DESC
                 LIMIT ?`,
                params,
            );
        }

        const now = new Date();
        const records = rows.map((r) =>
            this.recordRepo.create({
                type: dto.type,
                fullName: String(r.fullName || r.businessName || '-').slice(0, 150),
                businessName: r.businessName ? String(r.businessName).slice(0, 150) : undefined,
                phone: r.phone ? String(r.phone).slice(0, 30) : undefined,
                email: r.email ? String(r.email).slice(0, 150) : undefined,
                cityId: r.cityId ?? undefined,
                activity: r.activity ? String(r.activity) : undefined,
                userId: r.userId ?? undefined,
                vendorCompanyId: r.vendorCompanyId ?? undefined,
                lastActivityAt: r.lastActivityAt ? new Date(r.lastActivityAt) : undefined,
                notes: this.t(dto.type === CensusType.CLIENT ? 'census.import_note_client' : 'census.import_note_vendor', lang, {
                    orders: Number(r.orders || 0),
                    days,
                }),
                source: CensusSource.PLATFORM,
                status: CensusStatus.TO_CONTACT,
                consent: true,
                contactCount: 0,
                nextFollowUpAt: now,
                recordedById: actor?.id,
                assignedToId: dto.assignedToId ?? actor?.id,
            } as any),
        );
        // Enregistrement par lots
        for (let i = 0; i < records.length; i += 100) await this.recordRepo.save(records.slice(i, i + 100) as any);

        return {
            message: this.t('census.imported', lang, { count: records.length }),
            data: { created: records.length, type: dto.type, inactiveDays: days },
        };
    }

    // ============================================================
    // STATISTIQUES
    // ============================================================
    async stats(query: { type?: string; assignedToId?: string }, lang = 'fr') {
        const where: string[] = ['1 = 1'];
        const params: any[] = [];
        if (query.type) {
            where.push('r.type = ?');
            params.push(query.type);
        }
        if (query.assignedToId) {
            where.push('r.assignedToId = ?');
            params.push(query.assignedToId);
        }
        const w = where.join(' AND ');
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const [byStatus, byType, due, agents, followups, sources] = await Promise.all([
            this.q(`SELECT r.status AS status, COUNT(*) AS count FROM census_records r WHERE ${w} GROUP BY r.status`, params),
            this.q(`SELECT r.type AS type, COUNT(*) AS count FROM census_records r WHERE ${w} GROUP BY r.type`, params),
            this.q(
                `SELECT COUNT(*) AS count FROM census_records r
                  WHERE ${w} AND r.nextFollowUpAt <= ? AND r.status IN ('TO_CONTACT','CONTACTED','INTERESTED','UNREACHABLE')`,
                [...params, new Date()],
            ),
            this.q(
                `SELECT u.id AS agentId, u.fullName AS fullName, COUNT(*) AS records,
                        SUM(r.status = 'REACTIVATED') AS reactivated, SUM(r.status = 'INTERESTED') AS interested
                   FROM census_records r JOIN users u ON u.id = r.assignedToId
                  WHERE ${w} GROUP BY u.id, u.fullName ORDER BY reactivated DESC, records DESC LIMIT 20`,
                params,
            ),
            this.q(
                `SELECT f.result AS result, COUNT(*) AS count FROM census_followups f JOIN census_records r ON r.id = f.recordId
                  WHERE ${w} AND f.createdAt >= ? GROUP BY f.result`,
                [...params, monthStart],
            ),
            this.q(`SELECT r.source AS source, COUNT(*) AS count FROM census_records r WHERE ${w} GROUP BY r.source`, params),
        ]);

        const map = (rows: any[], k: string): Record<string, number> =>
            Object.fromEntries(rows.map((r) => [String(r[k]), Number(r.count || 0)]));
        const status = map(byStatus, 'status');
        const total: number = Object.values(status).reduce((sum: number, n: number) => sum + Number(n), 0);
        const contacted = total - (status[CensusStatus.TO_CONTACT] || 0);
        return {
            message: this.t('census.stats', lang),
            data: {
                total,
                byStatus: status,
                byType: map(byType, 'type'),
                bySource: map(sources, 'source'),
                dueToday: Number(due[0]?.count || 0),
                contactRate: total ? Math.round((contacted / total) * 1000) / 10 : 0,
                reactivationRate: contacted ? Math.round(((status[CensusStatus.REACTIVATED] || 0) / contacted) * 1000) / 10 : 0,
                followupsThisMonth: map(followups, 'result'),
                agents: agents.map((a) => ({
                    agentId: a.agentId,
                    fullName: a.fullName,
                    records: Number(a.records || 0),
                    interested: Number(a.interested || 0),
                    reactivated: Number(a.reactivated || 0),
                })),
            },
        };
    }

    // ============================================================
    // CHAQUE NUIT : CLIENTS / VENDEURS REVENUS → REACTIVATED
    // ============================================================
    @Cron('0 15 2 * * *')
    async markReactivated(): Promise<void> {
        try {
            // Client : commande passée APRÈS la création de la fiche
            const c: any = await this.dataSource.query(
                `UPDATE census_records r
                    SET r.status = 'REACTIVATED', r.nextFollowUpAt = NULL
                  WHERE r.type = 'CLIENT' AND r.userId IS NOT NULL AND r.status <> 'REACTIVATED'
                    AND EXISTS (SELECT 1 FROM orders o WHERE o.userId = r.userId AND o.createdAt > r.createdAt
                                  AND o.status <> 'REJECTED' AND o.cancelledAt IS NULL)`,
            );
            // Vendeur : nouvelle vente APRÈS la création de la fiche
            const v: any = await this.dataSource.query(
                `UPDATE census_records r
                    SET r.status = 'REACTIVATED', r.nextFollowUpAt = NULL
                  WHERE r.type = 'VENDOR' AND r.vendorCompanyId IS NOT NULL AND r.status <> 'REACTIVATED'
                    AND EXISTS (SELECT 1 FROM sub_orders so JOIN orders o ON o.id = so.orderId
                                 WHERE so.companyId = r.vendorCompanyId AND o.createdAt > r.createdAt
                                   AND o.status <> 'REJECTED' AND o.cancelledAt IS NULL)`,
            );
            const n = Number(c?.affectedRows || 0) + Number(v?.affectedRows || 0);
            if (n) this.logger.log(`🎉 Recensement : ${n} client(s) / vendeur(s) revenu(s) → REACTIVATED`);
        } catch (e: any) {
            this.logger.warn(`Recensement (réactivés) : ${e?.message}`);
        }
    }
}
