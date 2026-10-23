import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { Product } from 'src/products/entities/product.entity';
import { ListingType } from 'src/products/enum/listing-type.enum';
import { ClassifiedPaymentStatus, ClassifiedReportStatus, ClassifiedStatus } from '../enums/classified.enums';
import { ClassifiedPayment } from '../entities/classified-payment.entity';
import { ClassifiedReport } from '../entities/classified-report.entity';
import { AdminClassifiedQueryDto, HandleReportDto, RejectClassifiedDto, ReportsQueryDto, RevenueQueryDto } from '../dto/classified.dto';
import { ClassifiedCommonService, pageParams } from './classified-common.service';
import { ClassifiedPaymentService } from './classified-payment.service';
import { productStatusFor } from './classified.service';

/** Modération, signalements et recettes des annonces (admin / super admin) */
@Injectable()
export class ClassifiedAdminService {
  constructor(
    private readonly common: ClassifiedCommonService,
    private readonly payments: ClassifiedPaymentService,
  ) { }

  private get m() {
    return this.common.m;
  }

  private async findAd(id: string, lang: string) {
    const ad = await this.m.findOne(Product, { where: { id, listingType: ListingType.CLASSIFIED, adDeleted: false } });
    if (!ad) throw new NotFoundException(this.common.t('classified.not_found', lang));
    return ad;
  }

  async list(query: AdminClassifiedQueryDto, admin: UserEntity, lang: string) {
    this.common.assertAdmin(admin, lang);
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const qb = this.m
      .createQueryBuilder(Product, 'p')
      .leftJoinAndSelect('p.images', 'images')
      .leftJoin('p.owner', 'owner')
      .addSelect(['owner.id', 'owner.fullName', 'owner.phone', 'owner.email'])
      .leftJoin('p.adCity', 'adCity')
      .addSelect(['adCity.id', 'adCity.name'])
      .leftJoin('p.category', 'category')
      .addSelect(['category.id', 'category.name'])
      .where('p.listingType = :lt AND p.adDeleted = 0', { lt: ListingType.CLASSIFIED });
    if (query.status) qb.andWhere('p.adStatus = :status', { status: query.status });
    if (query.cityId) qb.andWhere('p.adCityId = :cityId', { cityId: query.cityId });
    if (query.categoryId) qb.andWhere('category.id = :categoryId', { categoryId: query.categoryId });
    if (query.userId) qb.andWhere('p.ownerId = :userId', { userId: query.userId });
    if (query.keyword) {
      const k = `%${query.keyword.trim()}%`;
      qb.andWhere(new Brackets((w) => w.where('p.name LIKE :k', { k }).orWhere('p.slug LIKE :k', { k }).orWhere('owner.fullName LIKE :k', { k })));
    }
    // File de modération : les plus anciennes d'abord
    qb.orderBy('p.updatedAt', query.status === ClassifiedStatus.PENDING_REVIEW ? 'ASC' : 'DESC').addOrderBy('images.id', 'ASC');
    const [items, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return { message: this.common.t('classified.list', lang), data: new PaginatedResponseDto(items, total, page, limit) };
  }

  async approve(id: string, admin: UserEntity, lang: string) {
    this.common.assertAdmin(admin, lang);
    const ad = await this.findAd(id, lang);
    if (ad.adStatus !== ClassifiedStatus.PENDING_REVIEW) throw new BadRequestException(this.common.t('classified.not_pending_review', lang));
    this.payments.activate(ad, ad.adPendingDays || 30, ad.adPendingFeatured);
    ad.adReviewedAt = new Date();
    ad.adReviewedById = admin.id;
    ad.adRejectionReason = null;
    await this.m.save(Product, ad);
    await this.common.notify(ad.ownerId!, 'approved', { title: ad.name, date: ad.adExpiresAt!.toISOString().slice(0, 10) }, { adId: ad.id, productId: ad.id }, lang);
    return { message: this.common.t('classified.approved', lang), data: ad };
  }

  /**
   * Refus (en attente de modération) ou retrait (annonce en ligne).
   * En attente : la durée payée est conservée — l'annonceur corrige et l'annonce repart en validation sans repayer.
   */
  async reject(id: string, dto: RejectClassifiedDto, admin: UserEntity, lang: string) {
    this.common.assertAdmin(admin, lang);
    const ad = await this.findAd(id, lang);
    if (ad.adStatus !== ClassifiedStatus.PENDING_REVIEW && ad.adStatus !== ClassifiedStatus.ACTIVE) {
      throw new BadRequestException(this.common.t('classified.cannot_reject', lang));
    }
    ad.adStatus = ClassifiedStatus.REJECTED;
    ad.status = productStatusFor(ClassifiedStatus.REJECTED);
    ad.adRejectionReason = dto.reason;
    ad.adReviewedById = admin.id;
    ad.adFeaturedUntil = null;
    await this.m.save(Product, ad);
    await this.common.notify(ad.ownerId!, 'rejected', { title: ad.name, reason: dto.reason }, { adId: ad.id, productId: ad.id }, lang);
    return { message: this.common.t('classified.rejected', lang), data: ad };
  }

  async reports(query: ReportsQueryDto, admin: UserEntity, lang: string) {
    this.common.assertAdmin(admin, lang);
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const qb = this.m
      .createQueryBuilder(ClassifiedReport, 'r')
      .leftJoin('r.product', 'p')
      .addSelect(['p.id', 'p.name', 'p.slug', 'p.adStatus', 'p.ownerId', 'p.image'])
      .leftJoin('r.reporter', 'u')
      .addSelect(['u.id', 'u.fullName']);
    if (query.status) qb.where('r.status = :s', { s: query.status });
    const [items, total] = await qb.orderBy('r.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
    return { message: this.common.t('classified.reports', lang), data: new PaginatedResponseDto(items, total, page, limit) };
  }

  async handleReport(reportId: string, dto: HandleReportDto, admin: UserEntity, lang: string) {
    this.common.assertAdmin(admin, lang);
    const report = await this.m.findOne(ClassifiedReport, { where: { id: reportId } });
    if (!report) throw new NotFoundException(this.common.t('classified.report_not_found', lang));
    report.status = dto.status;
    report.resolution = dto.resolution ?? null;
    report.handledById = admin.id;
    await this.m.save(ClassifiedReport, report);
    if (dto.takeDown && dto.status === ClassifiedReportStatus.RESOLVED) {
      const ad = await this.m.findOne(Product, { where: { id: report.productId } });
      if (ad && (ad.adStatus === ClassifiedStatus.ACTIVE || ad.adStatus === ClassifiedStatus.PENDING_REVIEW)) {
        await this.reject(ad.id, { reason: dto.resolution || report.reason }, admin, lang);
      }
      // Les autres signalements ouverts sur la même annonce sont clôturés
      await this.m.update(
        ClassifiedReport,
        { productId: report.productId, status: ClassifiedReportStatus.OPEN },
        { status: ClassifiedReportStatus.RESOLVED, handledById: admin.id },
      );
    }
    return { message: this.common.t('classified.report_handled', lang), data: report };
  }

  /** Recettes des annonces par ville, par forfait, par moyen de paiement et par jour */
  async revenue(query: RevenueQueryDto, admin: UserEntity, lang: string) {
    this.common.assertAdmin(admin, lang);
    const to = query.to ? new Date(`${query.to.slice(0, 10)}T23:59:59.999`) : new Date();
    const from = query.from ? new Date(`${query.from.slice(0, 10)}T00:00:00`) : new Date(to.getTime() - 29 * 86400000);
    const base = () => {
      const qb = this.m
        .createQueryBuilder(ClassifiedPayment, 'p')
        .where('p.status = :s', { s: ClassifiedPaymentStatus.SUCCESS })
        .andWhere('p.paidAt BETWEEN :from AND :to', { from, to });
      if (query.cityId) qb.andWhere('p.cityId = :cityId', { cityId: query.cityId });
      return qb;
    };
    const [byCurrency, byCity, byPlan, byMethod, daily, statuses] = await Promise.all([
      base().select('p.currency', 'currency').addSelect('SUM(p.amount)', 'amount').addSelect('COUNT(*)', 'count').groupBy('p.currency').getRawMany(),
      base()
        .leftJoin('cities', 'c', 'c.id = p.cityId')
        .select('p.cityId', 'cityId')
        .addSelect('c.name', 'city')
        .addSelect('p.currency', 'currency')
        .addSelect('SUM(p.amount)', 'amount')
        .addSelect('COUNT(*)', 'count')
        .groupBy('p.cityId')
        .addGroupBy('c.name')
        .addGroupBy('p.currency')
        .orderBy('amount', 'DESC')
        .getRawMany(),
      base()
        .select("JSON_UNQUOTE(JSON_EXTRACT(p.planSnapshot, '$.code'))", 'code')
        .addSelect('p.currency', 'currency')
        .addSelect('SUM(p.amount)', 'amount')
        .addSelect('COUNT(*)', 'count')
        .groupBy('code')
        .addGroupBy('p.currency')
        .getRawMany(),
      base().select('p.method', 'method').addSelect('SUM(p.amount)', 'amount').addSelect('COUNT(*)', 'count').groupBy('p.method').getRawMany(),
      base()
        .select('DATE(p.paidAt)', 'date')
        .addSelect('p.currency', 'currency')
        .addSelect('SUM(p.amount)', 'amount')
        .addSelect('COUNT(*)', 'count')
        .groupBy('date')
        .addGroupBy('p.currency')
        .orderBy('date', 'ASC')
        .getRawMany(),
      this.m
        .createQueryBuilder(Product, 'a')
        .select('a.adStatus', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('a.listingType = :lt AND a.adDeleted = 0', { lt: ListingType.CLASSIFIED })
        .groupBy('a.adStatus')
        .getRawMany(),
    ]);
    const n = (rows: any[]) => rows.map((r) => ({ ...r, amount: Number(r.amount || 0), count: Number(r.count || 0) }));
    return {
      message: this.common.t('classified.revenue', lang),
      data: {
        period: { from, to },
        totals: n(byCurrency),
        byCity: n(byCity),
        byPlan: n(byPlan),
        byMethod: n(byMethod),
        daily: n(daily),
        ads: Object.fromEntries(Object.values(ClassifiedStatus).map((s) => [s, Number(statuses.find((r) => r.status === s)?.count || 0)])),
        openReports: await this.m.count(ClassifiedReport, { where: { status: ClassifiedReportStatus.OPEN } }),
      },
    };
  }
}
