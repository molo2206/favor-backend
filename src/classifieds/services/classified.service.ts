import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Brackets, In } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { City } from 'src/company/entities/city.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { FilesService } from 'src/files/files.service';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { Product } from 'src/products/entities/product.entity';
import { ImageProductEntity } from 'src/products/entities/imageProduct.entity';
import { Brand } from 'src/products/entities/brand.entity';
import { ListingType } from 'src/products/enum/listing-type.enum';
import { ProductStatus } from 'src/products/enum/product.status.enum';
import { computeImageSignature } from 'src/users/utility/helpers/image-signature.util';
import { ClassifiedCondition, ClassifiedReportStatus, ClassifiedStatus } from '../enums/classified.enums';
import { ClassifiedReport } from '../entities/classified-report.entity';
import { ClassifiedSearchDto, CreateClassifiedDto, MyClassifiedsQueryDto, ReportClassifiedDto, UpdateClassifiedDto } from '../dto/classified.dto';
import { ClassifiedCommonService, pageParams } from './classified-common.service';

/** Nombre max de photos par annonce (le forfait peut limiter davantage) */
const MAX_IMAGES = Number(process.env.CLASSIFIED_MAX_IMAGES || 10);

/** Statuts où l'annonceur peut encore modifier le contenu */
const EDITABLE = [
  ClassifiedStatus.DRAFT,
  ClassifiedStatus.PENDING_PAYMENT,
  ClassifiedStatus.PENDING_REVIEW,
  ClassifiedStatus.ACTIVE,
  ClassifiedStatus.REJECTED,
  ClassifiedStatus.EXPIRED,
];

/**
 * Statut « produit » correspondant au statut de l'annonce.
 * Une annonce en ligne est PUBLISHED : elle apparaît aussi dans les listes de produits publiés existantes
 * (par catégorie, par type…), avec company = null et listingType = CLASSIFIED.
 */
export function productStatusFor(status: ClassifiedStatus): ProductStatus {
  switch (status) {
    case ClassifiedStatus.ACTIVE:
      return ProductStatus.PUBLISHED;
    case ClassifiedStatus.SOLD:
      return ProductStatus.SOLD;
    case ClassifiedStatus.REJECTED:
      return ProductStatus.REJECTED;
    default:
      return ProductStatus.PENDING;
  }
}

function slugify(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Annonces (type Jiji) enregistrées dans la table `products` (listingType = CLASSIFIED) :
 * photos dans `images_product`, catégorie, marque et champs véhicule existants,
 * favoris via la wishlist existante, commandes refusées (contact direct avec le vendeur).
 */
@Injectable()
export class ClassifiedService {
  constructor(
    private readonly common: ClassifiedCommonService,
    private readonly files: FilesService,
  ) { }

  private get m() {
    return this.common.m;
  }

  // ============================================================
  // OUTILS
  // ============================================================
  /** Annonce de l'utilisateur (ou admin) */
  async getOwnAd(id: string, user: UserEntity, lang: string): Promise<Product> {
    const ad = await this.m.findOne(Product, { where: { id, listingType: ListingType.CLASSIFIED, adDeleted: false } });
    if (!ad) throw new NotFoundException(this.common.t('classified.not_found', lang));
    if (ad.ownerId !== user.id && !this.common.isAdmin(user)) throw new ForbiddenException(this.common.t('classified.forbidden', lang));
    return ad;
  }

  async getAd(id: string, lang: string): Promise<Product> {
    const ad = await this.m.findOne(Product, { where: { id, listingType: ListingType.CLASSIFIED, adDeleted: false } });
    if (!ad) throw new NotFoundException(this.common.t('classified.not_found', lang));
    return ad;
  }

  private async checkCity(cityId: string, lang: string) {
    const city = await this.m.findOne(City, { where: { id: cityId } });
    if (!city || city.status === false) throw new BadRequestException(this.common.t('classified.city_not_found', lang));
  }

  private async getCategory(categoryId: string, lang: string): Promise<CategoryEntity> {
    const cat = await this.m.findOne(CategoryEntity, { where: { id: categoryId } });
    if (!cat || cat.deleted || cat.status === false) throw new BadRequestException(this.common.t('classified.category_not_found', lang));
    return cat;
  }

  private async getBrand(brandId: string, lang: string): Promise<Brand> {
    const brand = await this.m.findOne(Brand, { where: { id: brandId } });
    if (!brand) throw new BadRequestException(this.common.t('classified.brand_not_found', lang));
    return brand;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'annonce';
    for (let i = 0; i < 5; i++) {
      const slug = `${base}-${Math.random().toString(36).slice(2, 8)}`;
      if (!(await this.m.findOne(Product, { where: { slug }, select: ['id'] }))) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  /** Statut annonce + statut produit toujours alignés */
  async setStatus(productId: string, status: ClassifiedStatus, extra: Partial<Product> = {}) {
    await this.m.update(Product, { id: productId }, { ...extra, adStatus: status, status: productStatusFor(status) } as any);
  }

  /** Envoi des photos — même stockage et même table (images_product) que les produits */
  private async uploadImages(product: Product, files: Express.Multer.File[] | undefined, lang: string) {
    const images = (files || []).filter((f) => f && /^image\//.test(f.mimetype || ''));
    if (!images.length) return 0;
    const current = await this.m.count(ImageProductEntity, { where: { product: { id: product.id } } });
    if (current + images.length > MAX_IMAGES) {
      throw new BadRequestException(this.common.t('classified.too_many_images', lang, { max: MAX_IMAGES }));
    }
    const urls: string[] = [];
    for (const file of images) {
      const uploaded: any = await this.files.uploadFile(file, 'product', 'product');
      if (typeof uploaded?.data === 'string') urls.push(uploaded.data);
    }
    for (const url of urls) {
      await this.m.save(ImageProductEntity, this.m.create(ImageProductEntity, { url, product: { id: product.id } as Product }));
    }
    if (!product.image && urls.length) {
      product.image = urls[0];
      await this.m.update(Product, { id: product.id }, { image: urls[0] });
      await this.computeSignature(product.id, urls[0]);
    }
    return urls.length;
  }

  /** Signature visuelle (recherche par image existante) — n'échoue jamais */
  private async computeSignature(productId: string, url: string) {
    try {
      const buffer = await this.files.readFileFromUrl(url, 'product');
      const sig = await computeImageSignature(buffer);
      await this.m.update(Product, { id: productId }, {
        imageHashPhash: sig.phash,
        imageHashDhash: sig.dhash,
        imageHashAhash: sig.ahash,
        imageColorHistogram: JSON.stringify(sig.histogram),
      });
    } catch {
      /* signature facultative */
    }
  }

  /** Détail complet (photos, catégorie, marque, ville, annonceur) */
  async loadAd(id: string): Promise<Product | null> {
    return this.m
      .createQueryBuilder(Product, 'p')
      .leftJoinAndSelect('p.images', 'images')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.brand', 'brand')
      .leftJoin('p.adCity', 'adCity')
      .addSelect(['adCity.id', 'adCity.name', 'adCity.countryId'])
      .leftJoin('p.owner', 'owner')
      .addSelect(['owner.id', 'owner.fullName', 'owner.image', 'owner.createdAt'])
      .where('p.id = :id', { id })
      .orderBy('images.id', 'ASC')
      .getOne();
  }

  /** Vue publique : numéro masqué si demandé, champs internes retirés */
  publicView(ad: Product, extra: Record<string, any> = {}) {
    const {
      adContactPhone,
      adWhatsapp,
      adRejectionReason,
      adReviewedById,
      adPendingDays,
      adPendingFeatured,
      adReminderSent,
      adDeleted,
      imageHash,
      imageHashPhash,
      imageHashDhash,
      imageHashAhash,
      imageColorHistogram,
      imageOrbDescriptors,
      ...rest
    } = ad as any;
    return {
      ...rest,
      contactPhone: ad.adShowPhone ? adContactPhone : null,
      whatsapp: ad.adShowPhone ? adWhatsapp : null,
      isFeatured: !!ad.adFeaturedUntil && new Date(ad.adFeaturedUntil) > new Date(),
      ...extra,
    };
  }

  // ============================================================
  // ANNONCEUR
  // ============================================================
  async create(dto: CreateClassifiedDto, files: Express.Multer.File[] | undefined, user: UserEntity, lang: string) {
    await this.checkCity(dto.cityId, lang);
    const category = await this.getCategory(dto.categoryId, lang);
    const brand = dto.brandId ? await this.getBrand(dto.brandId, lang) : null;

    const product = await this.m.save(
      Product,
      this.m.create(Product, {
        listingType: ListingType.CLASSIFIED,
        ownerId: user.id,
        company: null as any, // ✅ pas d'entreprise
        name: dto.name.trim(),
        slug: await this.uniqueSlug(dto.name),
        description: dto.description.trim(),
        category,
        brand: brand ?? undefined,
        type: dto.type || CompanyType.SHOP,
        price: dto.price ?? (null as any),
        salePrice: dto.type === CompanyType.CAR ? dto.price ?? undefined : undefined,
        quantity: dto.quantity ?? 1,
        localization: dto.location ?? (null as any),
        model: dto.model ?? (null as any),
        year: dto.year ?? (null as any),
        color: dto.color,
        ...(dto.fuelType ? { fuelType: dto.fuelType } : {}),
        ...(dto.transmission ? { transmission: dto.transmission } : {}),
        typecar: dto.typecar ?? null,
        status: ProductStatus.PENDING,
        adStatus: ClassifiedStatus.DRAFT,
        adCityId: dto.cityId,
        adCondition: dto.condition ?? ClassifiedCondition.USED,
        adCurrency: (dto.currency || 'USD').toUpperCase(),
        adNegotiable: dto.negotiable ?? false,
        adContactPhone: dto.contactPhone ?? user.phone ?? null,
        adWhatsapp: dto.whatsapp ?? null,
        adShowPhone: dto.showPhone ?? true,
      }),
    );
    try {
      await this.uploadImages(product, files, lang);
    } catch (e) {
      await this.m.delete(Product, { id: product.id });
      throw e;
    }
    return { message: this.common.t('classified.created', lang), data: await this.loadAd(product.id) };
  }

  async update(id: string, dto: UpdateClassifiedDto, files: Express.Multer.File[] | undefined, user: UserEntity, lang: string) {
    const ad = await this.getOwnAd(id, user, lang);
    if (!ad.adStatus || !EDITABLE.includes(ad.adStatus)) throw new BadRequestException(this.common.t('classified.not_editable', lang));
    if (dto.cityId && dto.cityId !== ad.adCityId) {
      // La ville fixe le tarif : elle ne change plus une fois l'annonce payée
      if (ad.adPlanId) throw new BadRequestException(this.common.t('classified.city_locked', lang));
      await this.checkCity(dto.cityId, lang);
      ad.adCityId = dto.cityId;
    }
    if (dto.categoryId) ad.category = await this.getCategory(dto.categoryId, lang);
    if (dto.brandId) ad.brand = await this.getBrand(dto.brandId, lang);
    if (dto.name !== undefined) ad.name = dto.name.trim();
    if (dto.description !== undefined) ad.description = dto.description.trim();
    if (dto.type !== undefined) ad.type = dto.type;
    if (dto.price !== undefined) {
      ad.price = dto.price;
      if ((dto.type ?? ad.type) === CompanyType.CAR) ad.salePrice = dto.price;
    }
    if (dto.quantity !== undefined) ad.quantity = dto.quantity;
    if (dto.location !== undefined) ad.localization = dto.location;
    if (dto.model !== undefined) ad.model = dto.model;
    if (dto.year !== undefined) ad.year = dto.year;
    if (dto.color !== undefined) ad.color = dto.color;
    if (dto.fuelType !== undefined) ad.fuelType = dto.fuelType;
    if (dto.transmission !== undefined) ad.transmission = dto.transmission;
    if (dto.typecar !== undefined) ad.typecar = dto.typecar;
    if (dto.currency) ad.adCurrency = dto.currency.toUpperCase();
    if (dto.negotiable !== undefined) ad.adNegotiable = dto.negotiable;
    if (dto.condition !== undefined) ad.adCondition = dto.condition;
    if (dto.contactPhone !== undefined) ad.adContactPhone = dto.contactPhone;
    if (dto.whatsapp !== undefined) ad.adWhatsapp = dto.whatsapp;
    if (dto.showPhone !== undefined) ad.adShowPhone = dto.showPhone;

    // Une annonce refusée pendant la modération, puis corrigée, repart en validation sans repayer
    if (ad.adStatus === ClassifiedStatus.REJECTED && ad.adPendingDays) {
      ad.adStatus = ClassifiedStatus.PENDING_REVIEW;
      ad.adRejectionReason = null;
    }
    ad.status = productStatusFor(ad.adStatus!);
    await this.m.save(Product, ad);

    if (dto.removeImageIds?.length) {
      const imgs = await this.m.find(ImageProductEntity, { where: { id: In(dto.removeImageIds.map(Number)), product: { id } } });
      for (const img of imgs) await this.files.deleteFileByUrl(img.url).catch(() => false);
      if (imgs.length) await this.m.delete(ImageProductEntity, { id: In(imgs.map((i) => i.id)) });
      if (imgs.some((i) => i.url === ad.image)) {
        const first = await this.m.findOne(ImageProductEntity, { where: { product: { id } }, order: { id: 'ASC' } });
        ad.image = first?.url ?? (null as any);
        await this.m.update(Product, { id }, { image: ad.image ?? null } as any);
      }
    }
    await this.uploadImages(ad, files, lang);
    if (dto.coverImageId) {
      const cover = await this.m.findOne(ImageProductEntity, { where: { id: Number(dto.coverImageId), product: { id } } });
      if (!cover) throw new NotFoundException(this.common.t('classified.image_not_found', lang));
      await this.m.update(Product, { id }, { image: cover.url });
      await this.computeSignature(id, cover.url);
    }
    return { message: this.common.t('classified.updated', lang), data: await this.loadAd(id) };
  }

  async removeImage(id: string, imageId: number, user: UserEntity, lang: string) {
    const ad = await this.getOwnAd(id, user, lang);
    const img = await this.m.findOne(ImageProductEntity, { where: { id: imageId, product: { id } } });
    if (!img) throw new NotFoundException(this.common.t('classified.image_not_found', lang));
    await this.files.deleteFileByUrl(img.url).catch(() => false);
    await this.m.delete(ImageProductEntity, { id: imageId });
    if (ad.image === img.url) {
      const first = await this.m.findOne(ImageProductEntity, { where: { product: { id } }, order: { id: 'ASC' } });
      await this.m.update(Product, { id }, { image: first?.url ?? null } as any);
    }
    return { message: this.common.t('classified.image_removed', lang), data: { id: imageId } };
  }

  async mine(query: MyClassifiedsQueryDto, user: UserEntity, lang: string) {
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const qb = this.m
      .createQueryBuilder(Product, 'p')
      .leftJoinAndSelect('p.images', 'images')
      .leftJoin('p.category', 'category')
      .addSelect(['category.id', 'category.name'])
      .leftJoin('p.adCity', 'adCity')
      .addSelect(['adCity.id', 'adCity.name'])
      .where('p.listingType = :lt AND p.ownerId = :uid AND p.adDeleted = 0', { lt: ListingType.CLASSIFIED, uid: user.id });
    if (query.status) qb.andWhere('p.adStatus = :status', { status: query.status });
    const [items, total] = await qb.orderBy('p.createdAt', 'DESC').addOrderBy('images.id', 'ASC').skip(skip).take(limit).getManyAndCount();

    const counts = await this.m
      .createQueryBuilder(Product, 'p')
      .select('p.adStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('p.listingType = :lt AND p.ownerId = :uid AND p.adDeleted = 0', { lt: ListingType.CLASSIFIED, uid: user.id })
      .groupBy('p.adStatus')
      .getRawMany();
    return {
      message: this.common.t('classified.mine', lang),
      data: {
        ...new PaginatedResponseDto(items, total, page, limit),
        counts: Object.fromEntries(Object.values(ClassifiedStatus).map((s) => [s, Number(counts.find((c) => c.status === s)?.count || 0)])),
      },
    };
  }

  async myAdDetails(id: string, user: UserEntity, lang: string) {
    await this.getOwnAd(id, user, lang);
    const ad = await this.loadAd(id);
    const payments = await this.common.dataSource.query(
      'SELECT `id`, `reference`, `amount`, `currency`, `method`, `status`, `paidAt`, `createdAt`, `planSnapshot` FROM `classified_payments` WHERE `productId` = ? ORDER BY `createdAt` DESC',
      [id],
    );
    const favorites = await this.favoritesCount([id]);
    return { message: this.common.t('classified.details', lang), data: { ...ad, favoritesCount: favorites.get(id) ?? 0, payments } };
  }

  async markSold(id: string, user: UserEntity, lang: string) {
    const ad = await this.getOwnAd(id, user, lang);
    if (ad.adStatus !== ClassifiedStatus.ACTIVE) throw new BadRequestException(this.common.t('classified.not_active', lang));
    await this.setStatus(id, ClassifiedStatus.SOLD, { adFeaturedUntil: null });
    return { message: this.common.t('classified.sold', lang), data: await this.loadAd(id) };
  }

  /** Retirer l'annonce (le temps restant n'est pas remboursé) */
  async close(id: string, user: UserEntity, lang: string) {
    const ad = await this.getOwnAd(id, user, lang);
    if (ad.adStatus === ClassifiedStatus.PENDING_PAYMENT) throw new BadRequestException(this.common.t('classified.payment_in_progress', lang));
    if (ad.adStatus !== ClassifiedStatus.SOLD && ad.adStatus !== ClassifiedStatus.CLOSED) {
      await this.setStatus(id, ClassifiedStatus.CLOSED, { adFeaturedUntil: null });
    }
    return { message: this.common.t('classified.closed', lang), data: await this.loadAd(id) };
  }

  /** Suppression logique : la ligne produit et l'historique des paiements restent */
  async remove(id: string, user: UserEntity, lang: string) {
    const ad = await this.getOwnAd(id, user, lang);
    if (ad.adStatus === ClassifiedStatus.PENDING_PAYMENT) throw new BadRequestException(this.common.t('classified.payment_in_progress', lang));
    await this.setStatus(id, ClassifiedStatus.CLOSED, { adDeleted: true, adFeaturedUntil: null });
    return { message: this.common.t('classified.deleted', lang), data: { id } };
  }

  // ============================================================
  // PUBLIC
  // ============================================================
  async search(query: ClassifiedSearchDto, viewer: UserEntity | null, lang: string) {
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const now = new Date();
    // ℹ️ Pas de jointure sur les photos ici (pagination SQL exacte) : elles sont chargées ensuite
    const qb = this.m
      .createQueryBuilder(Product, 'p')
      .leftJoin('p.category', 'category')
      .addSelect(['category.id', 'category.name', 'category.slug'])
      .leftJoin('p.brand', 'brand')
      .addSelect(['brand.id', 'brand.name'])
      .leftJoin('p.adCity', 'adCity')
      .addSelect(['adCity.id', 'adCity.name', 'adCity.countryId'])
      .leftJoin('p.owner', 'owner')
      .addSelect(['owner.id', 'owner.fullName', 'owner.image'])
      .where('p.listingType = :lt AND p.adStatus = :active AND p.adDeleted = 0', { lt: ListingType.CLASSIFIED, active: ClassifiedStatus.ACTIVE })
      .andWhere('(p.adExpiresAt IS NULL OR p.adExpiresAt > :now)', { now });

    if (query.keyword?.trim()) {
      const words = query.keyword.trim().split(/\s+/).slice(0, 6);
      words.forEach((w, i) => {
        qb.andWhere(
          new Brackets((b) =>
            b
              .where(`p.name LIKE :k${i}`, { [`k${i}`]: `%${w}%` })
              .orWhere(`p.description LIKE :k${i}`)
              .orWhere(`category.name LIKE :k${i}`)
              .orWhere(`brand.name LIKE :k${i}`)
              .orWhere(`p.model LIKE :k${i}`),
          ),
        );
      });
    }
    if (query.categoryId) {
      const ids = await this.common.categoryWithChildren(query.categoryId);
      qb.andWhere('category.id IN (:...cats)', { cats: ids });
    }
    if (query.cityId) qb.andWhere('p.adCityId = :cityId', { cityId: query.cityId });
    if (query.countryId) qb.andWhere('adCity.countryId = :countryId', { countryId: query.countryId });
    if (query.userId) qb.andWhere('p.ownerId = :seller', { seller: query.userId });
    if (query.type) qb.andWhere('p.type = :type', { type: query.type });
    if (query.brandId) qb.andWhere('brand.id = :brandId', { brandId: query.brandId });
    if (query.typecar) qb.andWhere('p.typecar = :typecar', { typecar: query.typecar });
    if (query.year) qb.andWhere('p.year = :year', { year: query.year });
    if (query.currency) qb.andWhere('p.adCurrency = :cur', { cur: query.currency.toUpperCase() });
    if (query.minPrice !== undefined) qb.andWhere('p.price >= :minP', { minP: query.minPrice });
    if (query.maxPrice !== undefined) qb.andWhere('p.price <= :maxP', { maxP: query.maxPrice });
    if (query.condition) qb.andWhere('p.adCondition = :cond', { cond: query.condition });
    if (query.negotiable !== undefined) qb.andWhere('p.adNegotiable = :neg', { neg: query.negotiable });
    if (query.featuredOnly) qb.andWhere('p.adFeaturedUntil > :now', { now });

    // Annonces mises en avant d'abord, puis le tri demandé
    qb.orderBy('CASE WHEN p.adFeaturedUntil > :now THEN 1 ELSE 0 END', 'DESC');
    switch (query.sort) {
      case 'price_asc':
        qb.addOrderBy('p.price IS NULL', 'ASC').addOrderBy('p.price', 'ASC');
        break;
      case 'price_desc':
        qb.addOrderBy('p.price', 'DESC');
        break;
      case 'popular':
        qb.addOrderBy('p.adViews', 'DESC');
        break;
      default:
        qb.addOrderBy('p.adPublishedAt', 'DESC');
    }
    qb.addOrderBy('p.id', 'ASC');

    const [items, total] = await qb.offset(skip).limit(limit).getManyAndCount();
    await this.attachImages(items);
    const favIds = await this.favoriteIds(viewer, items.map((a) => a.id));
    const data = items.map((a) => this.publicView(a, { isFavorite: favIds.has(a.id) }));
    return { message: this.common.t('classified.list', lang), data: new PaginatedResponseDto(data, total, page, limit) };
  }

  private async attachImages(ads: Product[]) {
    if (!ads.length) return;
    // loadRelationIds : `product` contient directement l'id du produit
    const rows: any[] = await this.m.find(ImageProductEntity, {
      where: { product: { id: In(ads.map((a) => a.id)) } },
      loadRelationIds: { relations: ['product'] },
      order: { id: 'ASC' },
    });
    for (const ad of ads) ad.images = rows.filter((r) => r.product === ad.id).map((r) => ({ id: r.id, url: r.url }) as ImageProductEntity);
  }

  /** Favoris = wishlist existante (POST /products/add/new/wishlist) */
  private async favoriteIds(viewer: UserEntity | null, productIds: string[]): Promise<Set<string>> {
    if (!viewer?.id || !productIds.length) return new Set();
    const rows: { productId: string }[] = await this.common.dataSource.query(
      `SELECT \`productId\` FROM \`wishlists\` WHERE \`userId\` = ? AND \`deleted\` = 0 AND \`status\` = 1 AND \`productId\` IN (${productIds.map(() => '?').join(',')})`,
      [viewer.id, ...productIds],
    );
    return new Set(rows.map((r) => r.productId));
  }

  private async favoritesCount(productIds: string[]): Promise<Map<string, number>> {
    if (!productIds.length) return new Map();
    const rows: { productId: string; n: string }[] = await this.common.dataSource.query(
      `SELECT \`productId\`, COUNT(*) AS n FROM \`wishlists\` WHERE \`deleted\` = 0 AND \`status\` = 1 AND \`productId\` IN (${productIds.map(() => '?').join(',')}) GROUP BY \`productId\``,
      productIds,
    );
    return new Map(rows.map((r) => [r.productId, Number(r.n)]));
  }

  async publicDetails(id: string, viewer: UserEntity | null, lang: string) {
    const ad = await this.loadAd(id);
    const isOwner = !!viewer && ad?.ownerId === viewer.id;
    const visible =
      ad && ad.listingType === ListingType.CLASSIFIED && !ad.adDeleted && (ad.adStatus === ClassifiedStatus.ACTIVE || isOwner || this.common.isAdmin(viewer));
    if (!ad || !visible) throw new NotFoundException(this.common.t('classified.not_found', lang));
    if (!isOwner) await this.m.increment(Product, { id }, 'adViews', 1);

    const [favIds, sellerAds, similar] = await Promise.all([
      this.favoriteIds(viewer, [id]),
      this.m.count(Product, { where: { listingType: ListingType.CLASSIFIED, ownerId: ad.ownerId!, adStatus: ClassifiedStatus.ACTIVE, adDeleted: false } }),
      this.m
        .createQueryBuilder(Product, 'p')
        .where('p.listingType = :lt AND p.adStatus = :s AND p.adDeleted = 0 AND p.id <> :id', { lt: ListingType.CLASSIFIED, s: ClassifiedStatus.ACTIVE, id })
        .andWhere('p.category_id = :cat AND p.adCityId = :city', { cat: ad.category?.id ?? null, city: ad.adCityId })
        .orderBy('p.adPublishedAt', 'DESC')
        .limit(8)
        .getMany(),
    ]);
    await this.attachImages(similar);
    const owner = ad.owner;
    return {
      message: this.common.t('classified.details', lang),
      data: {
        ...this.publicView(ad, { isFavorite: favIds.has(id), isOwner }),
        seller: { ...(owner ? { id: owner.id, fullName: owner.fullName, image: owner.image, memberSince: owner.createdAt } : {}), activeAds: sellerAds },
        similar: similar.map((s) => this.publicView(s)),
      },
    };
  }

  /** Clic « Afficher le numéro / Appeler / WhatsApp » */
  async contact(id: string, viewer: UserEntity | null, lang: string) {
    const ad = await this.getAd(id, lang);
    if (ad.adStatus !== ClassifiedStatus.ACTIVE) throw new NotFoundException(this.common.t('classified.not_found', lang));
    if (!ad.adShowPhone) throw new BadRequestException(this.common.t('classified.phone_hidden', lang));
    if (viewer?.id !== ad.ownerId) await this.m.increment(Product, { id }, 'adContactClicks', 1);
    return { message: this.common.t('classified.contact', lang), data: { contactPhone: ad.adContactPhone, whatsapp: ad.adWhatsapp } };
  }

  // ============================================================
  // SIGNALEMENT
  // ============================================================
  async report(id: string, dto: ReportClassifiedDto, user: UserEntity, lang: string) {
    const ad = await this.getAd(id, lang);
    if (ad.ownerId === user.id) throw new BadRequestException(this.common.t('classified.cannot_report_own', lang));
    const already = await this.m.findOne(ClassifiedReport, { where: { productId: id, reporterId: user.id, status: ClassifiedReportStatus.OPEN } });
    if (already) return { message: this.common.t('classified.reported', lang), data: already };
    const report = await this.m.save(
      ClassifiedReport,
      this.m.create(ClassifiedReport, { productId: id, reporterId: user.id, reason: dto.reason, message: dto.message ?? null }),
    );
    return { message: this.common.t('classified.reported', lang), data: report };
  }
}
