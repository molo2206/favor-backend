// src/sms/sms-quota.service.ts
import {
    Injectable,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { SmsCategory, SmsRechargeEntity, SmsRechargeStatus } from './entity/sms-recharge.entity';
import { SmsLogEntity, SmsLogStatus } from './entity/sms-log.entity';
import { SmsService } from './sms.service';
import { Country } from 'src/company/entities/country.entity';

/**
 * Destinataire d'un SMS, pour décompter le quota de SON pays :
 *  - un numéro (pays déduit de l'indicatif : +243 → RDC, 0… → pays par défaut) ;
 *  - ou directement le pays : { countryId } (table countries).
 */
export type SmsQuotaTarget = string | null | undefined | { phone?: string | null; countryId?: string | null };

/** Résultat d'un décompte */
export interface SmsQuotaResult {
    allowed: boolean;
    quotaBefore: number;
    quotaAfter: number;
    /** Pays du destinataire (table countries) — null = inconnu */
    countryId: string | null;
    countryName: string | null;
    /** Réserve utilisée : COUNTRY (quota du pays), GLOBAL (quota commun), MIXED (les deux), NONE */
    pool: 'COUNTRY' | 'GLOBAL' | 'MIXED' | 'NONE';
}

/** Codes ISO à 3 lettres → 2 lettres (pour relier country_providers et countries quand les formats diffèrent) */
const ISO3_TO_ISO2: Record<string, string> = {
    COD: 'CD', COG: 'CG', RWA: 'RW', UGA: 'UG', BDI: 'BI', KEN: 'KE', TZA: 'TZ', ZMB: 'ZM', AGO: 'AO',
    CMR: 'CM', CAF: 'CF', TCD: 'TD', GAB: 'GA', GNQ: 'GQ', CIV: 'CI', SEN: 'SN', SLE: 'SL', NGA: 'NG',
    BEN: 'BJ', GHA: 'GH', TGO: 'TG', BFA: 'BF', MLI: 'ML', NER: 'NE', GIN: 'GN', MWI: 'MW', MOZ: 'MZ',
    ZWE: 'ZW', ZAF: 'ZA', ETH: 'ET', SSD: 'SS', SDN: 'SD', MDG: 'MG', FRA: 'FR', BEL: 'BE', USA: 'US',
};

/** Texte comparable : majuscules, sans accents ni ponctuation */
const norm = (v?: string | null) =>
    String(v ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase();

/** Code pays ramené à 2 lettres si possible (COD → CD) */
const iso2 = (v?: string | null) => {
    const n = norm(v);
    return ISO3_TO_ISO2[n] ?? n;
};

/**
 * ✅ Quotas SMS par catégorie ET par pays (table `countries`).
 *
 *  - Une recharge a un pays (countryId → countries.id) ou aucun (NULL = quota commun, tous pays).
 *  - Un SMS vers un numéro du pays X consomme d'abord les recharges de X (la plus ancienne d'abord),
 *    puis le quota commun (SMS_QUOTA_GLOBAL_FALLBACK=false pour l'interdire).
 *  - Pays du numéro : indicatif → country_providers (envoi SMS) → pays correspondant dans `countries`
 *    (même code, ou même nom). Pays inconnu : quota commun seulement.
 *  Les recharges existantes n'ont pas de pays → elles restent le quota commun : rien ne change sans nouvelle recharge par pays.
 */
@Injectable()
export class SmsQuotaService {
    private readonly logger = new Logger(SmsQuotaService.name);

    /** Cache des pays (table countries), rechargé toutes les 10 minutes */
    private countriesCache: { at: number; list: Country[] } | null = null;

    constructor(
        @InjectRepository(SmsRechargeEntity)
        private readonly rechargeRepo: Repository<SmsRechargeEntity>,
        @InjectRepository(SmsLogEntity)
        private readonly logRepo: Repository<SmsLogEntity>,
        private readonly dataSource: DataSource,
        private readonly smsService: SmsService,
        @InjectRepository(Country)
        private readonly countryRepo: Repository<Country>,
    ) { }

    // ============================================================
    // 🌍 PAYS (table countries)
    // ============================================================

    /** Le quota commun complète-t-il le quota d'un pays épuisé ? (SMS_QUOTA_GLOBAL_FALLBACK, défaut true) */
    private get globalFallback(): boolean {
        return String(process.env.SMS_QUOTA_GLOBAL_FALLBACK ?? 'true').toLowerCase() !== 'false';
    }

    private async countries(force = false): Promise<Country[]> {
        if (!force && this.countriesCache && Date.now() - this.countriesCache.at < 10 * 60 * 1000) {
            return this.countriesCache.list;
        }
        const list = await this.countryRepo.find({ order: { name: 'ASC' } });
        this.countriesCache = { at: Date.now(), list };
        return list;
    }

    /** Pays de `countries` correspondant à un pays de country_providers (même code, sinon même nom) */
    private matchCountry(
        list: Country[],
        provider: { code?: string; isoCode?: string; prefix?: string; name?: string | null },
    ): Country | null {
        const codes = new Set(
            [provider.code, provider.isoCode, provider.prefix, provider.prefix ? `+${provider.prefix}` : '']
                .filter(Boolean)
                .flatMap((c) => [norm(c), iso2(c)]),
        );
        const byCode = list.find((c) => c.code && (codes.has(norm(c.code)) || codes.has(iso2(c.code))));
        if (byCode) return byCode;
        const name = norm(provider.name);
        return name ? list.find((c) => norm(c.name) === name) ?? null : null;
    }

    /** Pays du destinataire (table countries) ou null */
    async resolveCountry(target: SmsQuotaTarget): Promise<Country | null> {
        try {
            if (!target) return null;
            const list = await this.countries();
            if (typeof target === 'object' && target.countryId) {
                return list.find((c) => c.id === target.countryId) ?? null;
            }
            const phone = typeof target === 'string' ? target : target.phone;
            const provider = phone ? this.smsService.resolveCountry(phone) : null;
            return provider ? this.matchCountry(list, provider) : null;
        } catch (e: any) {
            this.logger.warn(`Pays du destinataire introuvable : ${e?.message}`);
            return null;
        }
    }

    /**
     * Pays d'une recharge : vide / GLOBAL = quota commun ;
     * sinon id de `countries`, ou son code (CD) ou son nom (RDC).
     */
    async findRechargeCountry(value?: string | null): Promise<Country | null> {
        const raw = String(value ?? '').trim();
        if (!raw || ['GLOBAL', 'ALL'].includes(raw.toUpperCase())) return null;
        const list = await this.countries(true);
        const found =
            list.find((c) => c.id === raw) ??
            list.find((c) => c.code && (norm(c.code) === norm(raw) || iso2(c.code) === iso2(raw))) ??
            list.find((c) => norm(c.name) === norm(raw));
        if (!found) {
            throw new BadRequestException(`Pays introuvable dans la table countries : ${raw}`);
        }
        return found;
    }

    /**
     * Pays de la table `countries`, avec l'indicatif SMS reconnu (smsPrefix) :
     * un pays sans indicatif ne peut pas être détecté depuis un numéro (vérifier country_providers).
     */
    async listCountries() {
        const list = await this.countries(true);
        const providers = this.smsService.providerCountries();
        return list.map((c) => {
            const provider = providers.find((p) => this.matchCountry([c], p));
            return {
                id: c.id,
                name: c.name,
                code: c.code ?? null,
                flag: c.flag ?? null,
                status: c.status,
                smsPrefix: provider?.prefix ?? null,
                smsDetection: !!provider,
            };
        });
    }

    // ============================================================
    // 🔍 LECTURE
    // ============================================================

    /**
     * Recharge active (la plus ancienne) d'une catégorie.
     * countryId : undefined = toutes ; null = quota commun ; id = ce pays.
     */
    async getActiveRecharge(category: SmsCategory, countryId?: string | null): Promise<SmsRechargeEntity | null> {
        const where: any = { category, status: SmsRechargeStatus.ACTIVE };
        if (countryId !== undefined) where.countryId = countryId === null ? IsNull() : countryId;
        return this.rechargeRepo.findOne({ where, order: { createdAt: 'ASC' }, relations: ['country'] });
    }

    /**
     * Quota restant d'une catégorie.
     * countryId : undefined = tout (tous pays + commun) ; null = quota commun ; id = ce pays seulement.
     */
    async getRemainingQuota(category: SmsCategory, countryId?: string | null): Promise<number> {
        const qb = this.rechargeRepo
            .createQueryBuilder('r')
            .select('SUM(r.remaining)', 'total')
            .where('r.category = :category', { category })
            .andWhere('r.status = :status', { status: SmsRechargeStatus.ACTIVE });
        if (countryId === null) qb.andWhere('r.countryId IS NULL');
        else if (countryId !== undefined) qb.andWhere('r.countryId = :cid', { cid: countryId });
        const result = await qb.getRawOne();
        return Number(result?.total ?? 0);
    }

    /** SMS réellement envoyables vers un pays : son quota + le quota commun (si SMS_QUOTA_GLOBAL_FALLBACK) */
    async getAvailableForCountry(category: SmsCategory, countryId: string | null): Promise<number> {
        if (!countryId) return this.getRemainingQuota(category, null);
        const own = await this.getRemainingQuota(category, countryId);
        return this.globalFallback ? own + (await this.getRemainingQuota(category, null)) : own;
    }

    /** Quotas restants par catégorie et par pays (countryId null = quota commun) */
    async getQuotasByCountry(): Promise<
        { category: SmsCategory; countryId: string | null; countryName: string; countryCode: string | null; flag: string | null; remaining: number; recharges: number }[]
    > {
        const rows = await this.rechargeRepo
            .createQueryBuilder('r')
            .leftJoin('r.country', 'c')
            .select('r.category', 'category')
            .addSelect('r.countryId', 'countryId')
            .addSelect('MAX(c.name)', 'countryName')
            .addSelect('MAX(c.code)', 'countryCode')
            .addSelect('MAX(c.flag)', 'flag')
            .addSelect('SUM(r.remaining)', 'remaining')
            .addSelect('COUNT(*)', 'recharges')
            .where('r.status = :status', { status: SmsRechargeStatus.ACTIVE })
            .groupBy('r.category')
            .addGroupBy('r.countryId')
            .orderBy('r.category', 'ASC')
            .getRawMany();
        return rows.map((r) => ({
            category: r.category,
            countryId: r.countryId ?? null,
            countryName: r.countryId ? r.countryName ?? '' : 'Quota commun (tous pays)',
            countryCode: r.countryCode ?? null,
            flag: r.flag ?? null,
            remaining: Number(r.remaining ?? 0),
            recharges: Number(r.recharges ?? 0),
        }));
    }

    /**
     * Historique des recharges (avec le pays).
     * country : undefined = toutes ; 'GLOBAL' = quota commun ; id / code / nom d'un pays.
     */
    async getAllRecharges(category?: SmsCategory, country?: string): Promise<SmsRechargeEntity[]> {
        const where: any = {};
        if (category) where.category = category;
        if (country) {
            const found = await this.findRechargeCountry(country);
            where.countryId = found ? found.id : IsNull();
        }
        return this.rechargeRepo.find({
            where,
            relations: ['country'],
            order: { createdAt: 'DESC' },
        });
    }

    // ============================================================
    // 💰 RECHARGE
    // ============================================================

    /** country : id de `countries` (ou code / nom) ; vide = quota commun (tous pays) */
    async addRecharge(
        category: SmsCategory,
        quantity: number,
        userId?: string,
        paymentReference?: string,
        note?: string,
        country?: string | null,
    ): Promise<SmsRechargeEntity> {
        if (quantity <= 0) {
            throw new BadRequestException('Quantity must be > 0');
        }
        const found = await this.findRechargeCountry(country);

        const recharge = this.rechargeRepo.create({
            category,
            countryId: found?.id ?? null,
            quantity,
            used: 0,
            remaining: quantity,
            status: SmsRechargeStatus.ACTIVE,
            userId: userId ?? null,
            paymentReference: paymentReference ?? null,
            note: note ?? null,
        });

        const saved = await this.rechargeRepo.save(recharge);
        saved.country = found;
        return saved;
    }

    // ============================================================
    // 🔻 CONSOMMER — quota du pays d'abord, puis quota commun (FIFO)
    // ============================================================

    private async lockedRecharges(
        manager: EntityManager,
        category: SmsCategory,
        countryId: string | null,
    ): Promise<SmsRechargeEntity[]> {
        return manager.find(SmsRechargeEntity, {
            where: {
                category,
                status: SmsRechargeStatus.ACTIVE,
                countryId: countryId === null ? IsNull() : countryId,
            },
            order: { createdAt: 'ASC' },
            lock: { mode: 'pessimistic_write' },
        });
    }

    /**
     * Décompte `count` SMS du quota.
     * `target` : numéro du destinataire (ou { countryId }) → quota de son pays, puis quota commun.
     * Sans `target` : quota commun seulement (comportement d'avant).
     */
    async tryConsume(
        category: SmsCategory,
        count = 1,
        target?: SmsQuotaTarget,
    ): Promise<SmsQuotaResult> {
        const country = await this.resolveCountry(target);
        const countryId = country?.id ?? null;
        const countryName = country?.name ?? null;

        return this.dataSource.transaction(async (manager) => {
            const countryRecharges = countryId ? await this.lockedRecharges(manager, category, countryId) : [];
            const useGlobal = !countryId || this.globalFallback;
            const globalRecharges = useGlobal ? await this.lockedRecharges(manager, category, null) : [];

            // Ordre : recharges du pays d'abord, puis quota commun
            const recharges = [...countryRecharges, ...globalRecharges];
            const totalBefore = recharges.reduce((sum, r) => sum + r.remaining, 0);

            if (totalBefore < count) {
                return {
                    allowed: false,
                    quotaBefore: totalBefore,
                    quotaAfter: totalBefore,
                    countryId,
                    countryName,
                    pool: 'NONE' as const,
                };
            }

            let remainingToConsume = count;
            let fromCountry = 0;
            let fromGlobal = 0;
            for (const recharge of recharges) {
                if (remainingToConsume <= 0) break;

                const consumeFromThis = Math.min(recharge.remaining, remainingToConsume);
                if (consumeFromThis <= 0) continue;

                // ✅ Décrémenter les 3 champs
                recharge.quantity -= consumeFromThis;
                recharge.used += consumeFromThis;
                recharge.remaining -= consumeFromThis;

                remainingToConsume -= consumeFromThis;
                if (recharge.countryId) fromCountry += consumeFromThis;
                else fromGlobal += consumeFromThis;

                // ✅ Marquer épuisé si plus rien
                if (recharge.remaining <= 0 || recharge.quantity <= 0) {
                    recharge.status = SmsRechargeStatus.EXHAUSTED;
                    recharge.remaining = 0;
                    recharge.quantity = 0;
                }

                await manager.save(recharge);
            }

            return {
                allowed: true,
                quotaBefore: totalBefore,
                quotaAfter: totalBefore - count,
                countryId,
                countryName,
                pool: (fromCountry && fromGlobal ? 'MIXED' : fromCountry ? 'COUNTRY' : 'GLOBAL') as SmsQuotaResult['pool'],
            };
        });
    }

    // ============================================================
    // ♻️ REMBOURSER (même pays que le décompte, sinon quota commun)
    // ============================================================

    async refund(category: SmsCategory, count = 1, target?: SmsQuotaTarget): Promise<void> {
        const country = await this.resolveCountry(target);
        await this.dataSource.transaction(async (manager) => {
            const find = (cid: string | null) =>
                manager.findOne(SmsRechargeEntity, {
                    where: [
                        { category, status: SmsRechargeStatus.ACTIVE, countryId: cid === null ? IsNull() : cid },
                        { category, status: SmsRechargeStatus.EXHAUSTED, countryId: cid === null ? IsNull() : cid },
                    ],
                    order: { updatedAt: 'DESC' },
                    lock: { mode: 'pessimistic_write' },
                });

            const recharge = (country ? await find(country.id) : null) ?? (await find(null));
            if (!recharge) return;

            // ✅ Rembourser les 3 champs
            recharge.quantity += count;
            recharge.used = Math.max(0, recharge.used - count);
            recharge.remaining += count;

            // ✅ Réactiver si on a remboursé sur un pack épuisé
            if (
                recharge.remaining > 0 &&
                recharge.status === SmsRechargeStatus.EXHAUSTED
            ) {
                recharge.status = SmsRechargeStatus.ACTIVE;
            }

            await manager.save(recharge);
        });
    }

    // ============================================================
    // 📝 LOG
    // ============================================================

    async log(params: {
        category: SmsCategory;
        recipient: string;
        message: string;
        status: SmsLogStatus;
        quotaBefore: number;
        quotaAfter: number;
        errorMessage?: string;
        referenceId?: string;
        referenceType?: string;
        countryId?: string | null;
    }): Promise<SmsLogEntity> {
        // Pays du destinataire : fourni, sinon déduit du numéro
        const countryId = params.countryId ?? (await this.resolveCountry(params.recipient))?.id ?? null;
        const entry = this.logRepo.create({
            ...params,
            countryId,
            errorMessage: params.errorMessage ?? null,
            referenceId: params.referenceId ?? null,
            referenceType: params.referenceType ?? null,
        });
        return this.logRepo.save(entry);
    }
}
