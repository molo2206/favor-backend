import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Brackets, EntityManager, IsNull } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { City } from 'src/company/entities/city.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { ClassifiedPricingPlan } from '../entities/classified-pricing-plan.entity';
import {
  CLASSIFIED_TYPES,
  CreatePricingPlanDto,
  CreateTariffDto,
  PricingPlanQueryDto,
  TariffZoneDto,
  UpdatePricingPlanDto,
  UpdateTariffDto,
} from '../dto/classified.dto';
import { ClassifiedCommonService } from './classified-common.service';

/** Libellés des colonnes du tableau des tarifs */
export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  ALL: 'Tous les types',
  RESTAURANT: 'Restaurant',
  CAR: 'Voiture',
  GROCERY: 'Épicerie',
  SHOP: 'Boutique',
  SERVICE: 'Service',
  HOTEL: 'Hôtel',
  SHIPPING: 'Expédition',
  AGENCE: 'Agence',
};

/**
 * Tarification dynamique des annonces — ✅ PAR TYPE DE PRODUIT.
 *
 * Pour une annonce (type de produit, ville, catégorie), chaque forfait (code) prend la ligne la plus précise :
 *   1) type de produit de l'annonce (+32)  >  tarif « tous types » (productType = null) ;
 *   2) ville + catégorie (16/15) > ville (8) > pays + catégorie (6/5) > pays (4) > catégorie (2/1) > général (0).
 * Une ligne d'un AUTRE type de produit ne s'applique jamais.
 *
 * Types de produit : RESTAURANT, CAR, GROCERY, SHOP, SERVICE, HOTEL, SHIPPING, AGENCE.
 */
@Injectable()
export class ClassifiedPricingService {
  constructor(private readonly common: ClassifiedCommonService) { }

  private get m() {
    return this.common.m;
  }

  /** Type de produit valide (en majuscules) ou null */
  private normType(type?: string | null): string | null {
    if (!type) return null;
    const t = String(type).trim().toUpperCase();
    return (CLASSIFIED_TYPES as readonly string[]).includes(t) ? t : null;
  }

  private score(
    plan: ClassifiedPricingPlan,
    cityId: string,
    countryId: string | null,
    chain: string[],
    productType: string | null,
  ): number {
    let s = 0;
    // 1) Type de produit : le tarif du type de l'annonce l'emporte toujours sur le tarif « tous types »
    if (plan.productType) {
      if (!productType || plan.productType !== productType) return -1;
      s += 32;
    }
    // 2) Lieu
    if (plan.cityId) {
      if (plan.cityId !== cityId) return -1;
      s += 8;
    } else if (plan.countryId) {
      if (plan.countryId !== countryId) return -1;
      s += 4;
    }
    // 3) Catégorie
    if (plan.categoryId) {
      const idx = chain.indexOf(plan.categoryId);
      if (idx === -1) return -1;
      s += idx === 0 ? 2 : 1; // catégorie exacte > catégorie parente
      if (plan.cityId) s += 6; // ville + catégorie l'emporte sur ville seule
    }
    return s;
  }

  /** Forfaits disponibles pour une annonce de ce type de produit, dans cette ville / catégorie */
  async resolvePlans(
    cityId: string,
    categoryId: string | null | undefined,
    lang: string,
    productType?: string | null,
  ): Promise<ClassifiedPricingPlan[]> {
    const city = await this.m.findOne(City, { where: { id: cityId } });
    if (!city || city.status === false) throw new NotFoundException(this.common.t('classified.city_not_found', lang));
    const chain = await this.common.categoryChain(categoryId);
    const type = this.normType(productType);

    const candidates = await this.m
      .createQueryBuilder(ClassifiedPricingPlan, 'p')
      .where('p.isActive = 1')
      .andWhere(
        new Brackets((w) => {
          w.where('p.productType IS NULL');
          if (type) w.orWhere('p.productType = :type', { type });
        }),
      )
      .andWhere(new Brackets((w) => w.where('p.cityId IS NULL').orWhere('p.cityId = :cityId', { cityId })))
      .andWhere(new Brackets((w) => w.where('p.countryId IS NULL').orWhere('p.countryId = :countryId', { countryId: city.countryId })))
      .andWhere(
        new Brackets((w) => {
          w.where('p.categoryId IS NULL');
          if (chain.length) w.orWhere('p.categoryId IN (:...chain)', { chain });
        }),
      )
      .getMany();

    const best = new Map<string, { plan: ClassifiedPricingPlan; score: number }>();
    for (const plan of candidates) {
      const s = this.score(plan, cityId, city.countryId, chain, type);
      if (s < 0) continue;
      const cur = best.get(plan.code);
      if (!cur || s > cur.score) best.set(plan.code, { plan, score: s });
    }
    return [...best.values()]
      .map((b) => b.plan)
      .sort((a, b) => a.sortOrder - b.sortOrder || Number(a.price) - Number(b.price) || a.durationDays - b.durationDays);
  }

  async publicPricing(cityId: string, categoryId: string | undefined, lang: string, productType?: string | null) {
    const type = this.normType(productType);
    const plans = await this.resolvePlans(cityId, categoryId, lang, type);
    return {
      message: this.common.t('classified.pricing', lang),
      data: plans.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        durationDays: p.durationDays,
        price: Number(p.price),
        currency: p.currency,
        isFree: Number(p.price) <= 0,
        isFeatured: p.isFeatured,
        maxImages: p.maxImages,
        /** Type de produit du tarif appliqué (null = tarif valable pour tous les types) */
        productType: p.productType ?? null,
        scope: p.cityId ? 'CITY' : p.countryId ? 'COUNTRY' : 'GLOBAL',
      })),
    };
  }

  /** Types de produit pour lesquels on peut fixer un tarif */
  productTypes() {
    return { message: 'OK', data: [...CLASSIFIED_TYPES], labels: CLASSIFIED_TYPES.map((t) => ({ value: t, label: PRODUCT_TYPE_LABELS[t] ?? t })) };
  }

  // ============================================================
  // ADMINISTRATION DES TARIFS
  // ============================================================
  private async checkRefs(dto: Partial<CreatePricingPlanDto>, lang: string) {
    if (dto.cityId) {
      const city = await this.m.findOne(City, { where: { id: dto.cityId } });
      if (!city) throw new BadRequestException(this.common.t('classified.city_not_found', lang));
      if (dto.countryId && dto.countryId !== city.countryId) throw new BadRequestException(this.common.t('classified.city_country_mismatch', lang));
    }
    if (dto.categoryId) {
      const cat = await this.m.findOne(CategoryEntity, { where: { id: dto.categoryId } });
      if (!cat) throw new BadRequestException(this.common.t('classified.category_not_found', lang));
    }
  }

  /** Une seule ligne active par (code, type de produit, ville, pays, catégorie) */
  private async checkDuplicate(plan: Partial<ClassifiedPricingPlan>, lang: string, excludeId?: string) {
    const qb = this.m
      .createQueryBuilder(ClassifiedPricingPlan, 'p')
      .where('p.code = :code', { code: plan.code })
      .andWhere('p.isActive = 1');
    for (const f of ['productType', 'cityId', 'countryId', 'categoryId'] as const) {
      if (plan[f]) qb.andWhere(`p.${f} = :${f}`, { [f]: plan[f] });
      else qb.andWhere(`p.${f} IS NULL`);
    }
    if (excludeId) qb.andWhere('p.id <> :id', { id: excludeId });
    if (await qb.getOne()) throw new BadRequestException(this.common.t('classified.plan_exists', lang));
  }

  async createPlan(dto: CreatePricingPlanDto, user: UserEntity, lang: string) {
    this.common.assertAdmin(user, lang);
    await this.checkRefs(dto, lang);
    const plan = this.m.create(ClassifiedPricingPlan, {
      code: dto.code,
      name: dto.name.trim(),
      description: dto.description ?? null,
      productType: this.normType(dto.productType),
      cityId: dto.cityId ?? null,
      countryId: dto.cityId ? null : dto.countryId ?? null,
      categoryId: dto.categoryId ?? null,
      durationDays: dto.durationDays,
      price: dto.price,
      currency: (dto.currency || 'USD').toUpperCase(),
      isFeatured: dto.isFeatured ?? false,
      maxImages: dto.maxImages ?? 10,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    if (plan.isActive) await this.checkDuplicate(plan, lang);
    return { message: this.common.t('classified.plan_created', lang), data: await this.m.save(ClassifiedPricingPlan, plan) };
  }

  async listPlans(query: PricingPlanQueryDto, user: UserEntity, lang: string) {
    this.common.assertAdmin(user, lang);
    const qb = this.m
      .createQueryBuilder(ClassifiedPricingPlan, 'p')
      .leftJoin('p.city', 'city')
      .addSelect(['city.id', 'city.name'])
      .leftJoin('p.country', 'country')
      .addSelect(['country.id', 'country.name'])
      .leftJoin('p.category', 'category')
      .addSelect(['category.id', 'category.name']);
    if (query.globalOnly) qb.andWhere('p.cityId IS NULL AND p.countryId IS NULL');
    if (query.productType === 'ALL') qb.andWhere('p.productType IS NULL');
    else if (query.productType) qb.andWhere('p.productType = :productType', { productType: query.productType });
    if (query.cityId) qb.andWhere('p.cityId = :cityId', { cityId: query.cityId });
    if (query.countryId) qb.andWhere('p.countryId = :countryId', { countryId: query.countryId });
    if (query.categoryId) qb.andWhere('p.categoryId = :categoryId', { categoryId: query.categoryId });
    if (query.code) qb.andWhere('p.code = :code', { code: query.code.toUpperCase() });
    if (query.isActive !== undefined) qb.andWhere('p.isActive = :a', { a: query.isActive });
    const data = await qb
      .orderBy('p.productType', 'ASC')
      .addOrderBy('p.code', 'ASC')
      .addOrderBy('p.sortOrder', 'ASC')
      .getMany();
    return { message: this.common.t('classified.plans', lang), data };
  }

  async updatePlan(id: string, dto: UpdatePricingPlanDto, user: UserEntity, lang: string) {
    this.common.assertAdmin(user, lang);
    const plan = await this.m.findOne(ClassifiedPricingPlan, { where: { id } });
    if (!plan) throw new NotFoundException(this.common.t('classified.plan_not_found', lang));
    await this.checkRefs({ cityId: dto.cityId ?? plan.cityId ?? undefined, countryId: dto.countryId, categoryId: dto.categoryId }, lang);
    const fields = ['code', 'name', 'description', 'cityId', 'countryId', 'categoryId', 'durationDays', 'price', 'isFeatured', 'maxImages', 'isActive', 'sortOrder'] as const;
    for (const f of fields) if (dto[f] !== undefined) (plan as any)[f] = dto[f];
    // ✅ productType : null / "" / "ALL" = tous les types de produit
    if (dto.productType !== undefined) plan.productType = this.normType(dto.productType);
    if (dto.currency) plan.currency = dto.currency.toUpperCase();
    if (plan.cityId) plan.countryId = null;
    if (plan.isActive) await this.checkDuplicate(plan, lang, plan.id);
    // ℹ️ Les paiements passés gardent une copie du forfait (planSnapshot) : changer un prix n'affecte que les prochains paiements
    return { message: this.common.t('classified.plan_updated', lang), data: await this.m.save(ClassifiedPricingPlan, plan) };
  }

  async deletePlan(id: string, user: UserEntity, lang: string) {
    this.common.assertAdmin(user, lang);
    const plan = await this.m.findOne(ClassifiedPricingPlan, { where: { id } });
    if (!plan) throw new NotFoundException(this.common.t('classified.plan_not_found', lang));
    const used = await this.common.dataSource.query('SELECT 1 FROM `classified_payments` WHERE `planId` = ? LIMIT 1', [id]);
    if (used?.length) {
      plan.isActive = false;
      await this.m.save(ClassifiedPricingPlan, plan);
      return { message: this.common.t('classified.plan_deactivated', lang), data: plan };
    }
    await this.m.delete(ClassifiedPricingPlan, { id });
    return { message: this.common.t('classified.plan_deleted', lang), data: { id } };
  }

  /**
   * Copie les tarifs généraux (sans ville ni pays) vers une ville, pour les ajuster ensuite.
   * Chaque type de produit garde son tarif (CAR → CAR, SHOP → SHOP…).
   * `productType` : ne copier que les tarifs de ce type ("ALL" = seulement les tarifs « tous types »).
   */
  async copyToCity(cityId: string, percent: number | undefined, user: UserEntity, lang: string, productType?: string) {
    this.common.assertAdmin(user, lang);
    const city = await this.m.findOne(City, { where: { id: cityId } });
    if (!city) throw new NotFoundException(this.common.t('classified.city_not_found', lang));
    const onlyType = productType ? String(productType).toUpperCase() : undefined;
    const typeFilter =
      onlyType === 'ALL' ? { productType: IsNull() } : this.normType(onlyType) ? { productType: this.normType(onlyType)! } : {};
    const globals = await this.m.find(ClassifiedPricingPlan, {
      where: { cityId: IsNull(), countryId: IsNull(), isActive: true, ...typeFilter },
    });
    const factor = 1 + (Number(percent) || 0) / 100;
    let created = 0;
    for (const g of globals) {
      const exists = await this.m.findOne(ClassifiedPricingPlan, {
        where: {
          code: g.code,
          cityId,
          categoryId: g.categoryId ?? IsNull(),
          productType: g.productType ?? IsNull(),
          isActive: true,
        },
      });
      if (exists) continue;
      await this.m.save(
        ClassifiedPricingPlan,
        this.m.create(ClassifiedPricingPlan, {
          ...g,
          id: undefined,
          cityId,
          countryId: null,
          price: Math.max(0, Math.round(Number(g.price) * factor * 100) / 100),
          createdAt: undefined,
          updatedAt: undefined,
        }),
      );
      created++;
    }
    return { message: this.common.t('classified.plans_copied', lang, { count: created, city: city.name }), data: { cityId, created } };
  }

  // ============================================================
  // ✅ TARIFS :  un tarif = nom + durée + devise,  puis un tableau  Type | Prix
  //    « Standard 7 jours » (7 j, USD) :  Restaurant | 2   Voiture | 10   Boutique | 2 …
  //    Zone : générale (rien), un pays ou une ville (+ catégorie facultative).
  //    En base : une ligne classified_pricing_plans par type (même code).
  // ============================================================
  /** Zone exacte (une ville l'emporte sur le pays) */
  private zone(q: { cityId?: string | null; countryId?: string | null; categoryId?: string | null }) {
    return {
      cityId: q.cityId || null,
      countryId: q.cityId ? null : q.countryId || null,
      categoryId: q.categoryId || null,
    };
  }

  private whereZone(z: { cityId: string | null; countryId: string | null; categoryId: string | null }) {
    return {
      cityId: z.cityId ?? IsNull(),
      countryId: z.countryId ?? IsNull(),
      categoryId: z.categoryId ?? IsNull(),
    };
  }

  private readonly typeOrder = ['ALL', ...CLASSIFIED_TYPES] as string[];

  /** Vérifie le tableau Type | Prix (pas de type en double, au moins une ligne) */
  private checkPrices(prices: { type: string; price: number }[] | undefined, lang: string) {
    if (!prices?.length) throw new BadRequestException(this.common.t('classified.tariff_no_price', lang));
    const seen = new Set<string>();
    for (const p of prices) {
      if (seen.has(p.type))
        throw new BadRequestException(this.common.t('classified.tariff_duplicate_type', lang, { type: PRODUCT_TYPE_LABELS[p.type] ?? p.type }));
      seen.add(p.type);
    }
  }

  /** Code créé à partir du nom : « Standard 7 jours » → STANDARD_7_JOURS */
  private codeFromName(name: string, durationDays: number) {
    const base = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 44);
    return base.length >= 2 ? base : `TARIF_${durationDays}J`;
  }

  /** Lignes en base → un tarif avec son tableau Type | Prix */
  private toTariff(rows: ClassifiedPricingPlan[]) {
    const first = rows[0];
    return {
      code: first.code,
      name: first.name,
      description: first.description ?? null,
      durationDays: first.durationDays,
      currency: first.currency,
      isFeatured: first.isFeatured,
      maxImages: first.maxImages,
      sortOrder: first.sortOrder,
      prices: rows
        .map((r) => {
          const type = r.productType ?? 'ALL';
          return { id: r.id, type, label: PRODUCT_TYPE_LABELS[type] ?? type, price: Number(r.price) };
        })
        .sort((a, b) => this.typeOrder.indexOf(a.type) - this.typeOrder.indexOf(b.type)),
    };
  }

  private async zoneRows(m: EntityManager, z: ReturnType<ClassifiedPricingService['zone']>, code?: string) {
    return m.find(ClassifiedPricingPlan, {
      where: { isActive: true, ...this.whereZone(z), ...(code ? { code } : {}) },
      order: { sortOrder: 'ASC', durationDays: 'ASC' },
    });
  }

  /** Retire une ligne (désactivée si elle a déjà servi à un paiement) */
  private async removeRow(m: EntityManager, id: string) {
    const used = await m.query('SELECT 1 FROM `classified_payments` WHERE `planId` = ? LIMIT 1', [id]);
    if (used?.length) await m.update(ClassifiedPricingPlan, { id }, { isActive: false });
    else await m.delete(ClassifiedPricingPlan, { id });
  }

  /** GET /admin/classifieds/tariffs?cityId=&countryId=&categoryId= */
  async listTariffs(query: TariffZoneDto, user: UserEntity, lang: string) {
    this.common.assertAdmin(user, lang);
    await this.checkRefs(query as any, lang);
    const z = this.zone(query);
    const rows = await this.zoneRows(this.m, z);
    const byCode = new Map<string, ClassifiedPricingPlan[]>();
    for (const r of rows) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r]);
    return {
      message: this.common.t('classified.plans', lang),
      data: {
        zone: { ...z, level: z.cityId ? 'CITY' : z.countryId ? 'COUNTRY' : 'GLOBAL' },
        /** Liste déroulante « Type » */
        types: this.typeOrder.map((t) => ({ value: t, label: PRODUCT_TYPE_LABELS[t] ?? t })),
        tariffs: [...byCode.values()].map((r) => this.toTariff(r)),
      },
    };
  }

  /** POST /admin/classifieds/tariffs — nouveau tarif avec son tableau Type | Prix */
  async createTariff(dto: CreateTariffDto, user: UserEntity, lang: string) {
    this.common.assertAdmin(user, lang);
    await this.checkRefs(dto as any, lang);
    this.checkPrices(dto.prices, lang);
    const z = this.zone(dto);

    const saved = await this.common.dataSource.transaction(async (m: EntityManager) => {
      let code = dto.code || this.codeFromName(dto.name, dto.durationDays);
      if (dto.code) {
        if ((await this.zoneRows(m, z, code)).length) throw new BadRequestException(this.common.t('classified.tariff_exists', lang));
      } else {
        const base = code;
        for (let i = 2; (await this.zoneRows(m, z, code)).length; i++) code = `${base}_${i}`;
      }
      const common = {
        code,
        name: dto.name.trim(),
        description: dto.description ?? null,
        durationDays: dto.durationDays,
        currency: (dto.currency || 'USD').toUpperCase(),
        isFeatured: dto.isFeatured ?? false,
        maxImages: dto.maxImages ?? 10,
        sortOrder: dto.sortOrder ?? 0,
        isActive: true,
        ...z,
      };
      const out: ClassifiedPricingPlan[] = [];
      for (const p of dto.prices) {
        out.push(
          await m.save(
            ClassifiedPricingPlan,
            m.create(ClassifiedPricingPlan, { ...common, productType: p.type === 'ALL' ? null : p.type, price: Math.round(p.price * 100) / 100 }),
          ),
        );
      }
      return out;
    });
    return { message: this.common.t('classified.plan_created', lang), data: this.toTariff(saved) };
  }

  /**
   * PATCH /admin/classifieds/tariffs/:code — modifier le nom, la durée, la devise…
   * et/ou le tableau Type | Prix (si `prices` est envoyé : il remplace tout le tableau).
   */
  async updateTariff(code: string, dto: UpdateTariffDto, user: UserEntity, lang: string) {
    this.common.assertAdmin(user, lang);
    await this.checkRefs(dto as any, lang);
    if (dto.prices !== undefined) this.checkPrices(dto.prices, lang);
    const z = this.zone(dto);
    code = String(code).trim().toUpperCase();

    const saved = await this.common.dataSource.transaction(async (m: EntityManager) => {
      const rows = await this.zoneRows(m, z, code);
      if (!rows.length) throw new NotFoundException(this.common.t('classified.tariff_not_found', lang));
      const first = rows[0];
      const common = {
        code,
        name: dto.name?.trim() ?? first.name,
        description: dto.description !== undefined ? dto.description : first.description ?? null,
        durationDays: dto.durationDays ?? first.durationDays,
        currency: (dto.currency ?? first.currency).toUpperCase(),
        isFeatured: dto.isFeatured ?? first.isFeatured,
        maxImages: dto.maxImages ?? first.maxImages,
        sortOrder: dto.sortOrder ?? first.sortOrder,
        isActive: true,
        ...z,
      };
      // ℹ️ Les paiements passés gardent une copie du forfait (planSnapshot)
      const byType = new Map<string, ClassifiedPricingPlan>(rows.map((r) => [r.productType ?? 'ALL', r]));

      if (dto.prices !== undefined) {
        const wanted = new Set(dto.prices.map((p) => p.type as string));
        for (const r of rows) if (!wanted.has(r.productType ?? 'ALL')) await this.removeRow(m, r.id);
        for (const p of dto.prices) {
          const cur = byType.get(p.type);
          const price = Math.round(p.price * 100) / 100;
          if (cur) await m.save(ClassifiedPricingPlan, Object.assign(cur, common, { price }));
          else await m.save(ClassifiedPricingPlan, m.create(ClassifiedPricingPlan, { ...common, productType: p.type === 'ALL' ? null : p.type, price }));
        }
      } else {
        for (const r of rows) await m.save(ClassifiedPricingPlan, Object.assign(r, common));
      }
      return this.zoneRows(m, z, code);
    });
    return { message: this.common.t('classified.plan_updated', lang), data: this.toTariff(saved) };
  }

  /** DELETE /admin/classifieds/tariffs/:code?cityId=… — supprime le tarif et tout son tableau */
  async deleteTariff(code: string, query: TariffZoneDto, user: UserEntity, lang: string) {
    this.common.assertAdmin(user, lang);
    const z = this.zone(query);
    code = String(code).trim().toUpperCase();
    const removed = await this.common.dataSource.transaction(async (m: EntityManager) => {
      const rows = await this.zoneRows(m, z, code);
      if (!rows.length) throw new NotFoundException(this.common.t('classified.tariff_not_found', lang));
      for (const r of rows) await this.removeRow(m, r.id);
      return rows.length;
    });
    return { message: this.common.t('classified.plan_deleted', lang), data: { code, removed } };
  }
}
