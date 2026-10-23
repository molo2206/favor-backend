import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Brackets, IsNull } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { City } from 'src/company/entities/city.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { ClassifiedPricingPlan } from '../entities/classified-pricing-plan.entity';
import { CreatePricingPlanDto, PricingPlanQueryDto, UpdatePricingPlanDto } from '../dto/classified.dto';
import { ClassifiedCommonService } from './classified-common.service';

/**
 * Tarification dynamique des annonces.
 * Pour une ville et une catégorie, chaque forfait (code) prend la ligne la plus précise :
 *   ville + catégorie (16/15) > ville (8) > pays + catégorie (6/5) > pays (4) > catégorie (2/1) > général (0).
 */
@Injectable()
export class ClassifiedPricingService {
  constructor(private readonly common: ClassifiedCommonService) { }

  private get m() {
    return this.common.m;
  }

  private score(plan: ClassifiedPricingPlan, cityId: string, countryId: string | null, chain: string[]): number {
    let s = 0;
    if (plan.cityId) {
      if (plan.cityId !== cityId) return -1;
      s += 8;
    } else if (plan.countryId) {
      if (plan.countryId !== countryId) return -1;
      s += 4;
    }
    if (plan.categoryId) {
      const idx = chain.indexOf(plan.categoryId);
      if (idx === -1) return -1;
      s += idx === 0 ? 2 : 1; // catégorie exacte > catégorie parente
      if (plan.cityId) s += 6; // ville + catégorie l'emporte sur ville seule
    }
    return s;
  }

  /** Forfaits disponibles pour une annonce dans cette ville / catégorie */
  async resolvePlans(cityId: string, categoryId: string | null | undefined, lang: string): Promise<ClassifiedPricingPlan[]> {
    const city = await this.m.findOne(City, { where: { id: cityId } });
    if (!city || city.status === false) throw new NotFoundException(this.common.t('classified.city_not_found', lang));
    const chain = await this.common.categoryChain(categoryId);

    const candidates = await this.m
      .createQueryBuilder(ClassifiedPricingPlan, 'p')
      .where('p.isActive = 1')
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
      const s = this.score(plan, cityId, city.countryId, chain);
      if (s < 0) continue;
      const cur = best.get(plan.code);
      if (!cur || s > cur.score) best.set(plan.code, { plan, score: s });
    }
    return [...best.values()]
      .map((b) => b.plan)
      .sort((a, b) => a.sortOrder - b.sortOrder || Number(a.price) - Number(b.price) || a.durationDays - b.durationDays);
  }

  async publicPricing(cityId: string, categoryId: string | undefined, lang: string) {
    const plans = await this.resolvePlans(cityId, categoryId, lang);
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
        scope: p.cityId ? 'CITY' : p.countryId ? 'COUNTRY' : 'GLOBAL',
      })),
    };
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

  /** Une seule ligne active par (code, ville, pays, catégorie) */
  private async checkDuplicate(plan: Partial<ClassifiedPricingPlan>, lang: string, excludeId?: string) {
    const qb = this.m
      .createQueryBuilder(ClassifiedPricingPlan, 'p')
      .where('p.code = :code', { code: plan.code })
      .andWhere('p.isActive = 1');
    for (const f of ['cityId', 'countryId', 'categoryId'] as const) {
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
    if (query.cityId) qb.andWhere('p.cityId = :cityId', { cityId: query.cityId });
    if (query.countryId) qb.andWhere('p.countryId = :countryId', { countryId: query.countryId });
    if (query.categoryId) qb.andWhere('p.categoryId = :categoryId', { categoryId: query.categoryId });
    if (query.code) qb.andWhere('p.code = :code', { code: query.code.toUpperCase() });
    if (query.isActive !== undefined) qb.andWhere('p.isActive = :a', { a: query.isActive });
    const data = await qb.orderBy('p.code', 'ASC').addOrderBy('p.sortOrder', 'ASC').getMany();
    return { message: this.common.t('classified.plans', lang), data };
  }

  async updatePlan(id: string, dto: UpdatePricingPlanDto, user: UserEntity, lang: string) {
    this.common.assertAdmin(user, lang);
    const plan = await this.m.findOne(ClassifiedPricingPlan, { where: { id } });
    if (!plan) throw new NotFoundException(this.common.t('classified.plan_not_found', lang));
    await this.checkRefs({ cityId: dto.cityId ?? plan.cityId ?? undefined, countryId: dto.countryId, categoryId: dto.categoryId }, lang);
    const fields = ['code', 'name', 'description', 'cityId', 'countryId', 'categoryId', 'durationDays', 'price', 'isFeatured', 'maxImages', 'isActive', 'sortOrder'] as const;
    for (const f of fields) if (dto[f] !== undefined) (plan as any)[f] = dto[f];
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

  /** Copie les tarifs généraux vers une ville (point de départ pour l'ajuster) */
  async copyToCity(cityId: string, percent: number | undefined, user: UserEntity, lang: string) {
    this.common.assertAdmin(user, lang);
    const city = await this.m.findOne(City, { where: { id: cityId } });
    if (!city) throw new NotFoundException(this.common.t('classified.city_not_found', lang));
    const globals = await this.m.find(ClassifiedPricingPlan, { where: { cityId: IsNull(), countryId: IsNull(), isActive: true } });
    const factor = 1 + (Number(percent) || 0) / 100;
    let created = 0;
    for (const g of globals) {
      const exists = await this.m.findOne(ClassifiedPricingPlan, {
        where: { code: g.code, cityId, categoryId: g.categoryId ?? IsNull(), isActive: true },
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
}
