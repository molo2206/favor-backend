import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, In } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { NotificationsService } from 'src/notification/notifications.service';
import { FcmService } from 'src/notification/fcm.service';
import { NotificationType } from 'src/notification/type/notification.type';
import { MaterialRequestStatus, MaterialRequestPriority } from '../common/logistics.enums';
import { isCompanyOwner, isLogisticsManager, pageParams, reference, resolveCompanyId } from '../common/logistics-access';
import { LogisticsImageService } from '../common/logistics-image.service';
import { Asset } from '../assets/entities/asset.entity';
import { AssetCategory } from '../assets/entities/asset-category.entity';
import { AssetAssignment } from '../assets/entities/asset-assignment.entity';
import { AssetService } from '../assets/asset.service';
import { MaterialRequest } from './entities/material-request.entity';
import { MaterialRequestItem } from './entities/material-request-item.entity';
import { LogisticsManager } from './entities/logistics-manager.entity';
import {
  AddLogisticsManagerDto,
  ApproveMaterialRequestDto,
  CreateMaterialRequestDto,
  IssueMaterialRequestDto,
  MaterialRequestQueryDto,
  RejectMaterialRequestDto,
} from './dto/material-request.dto';

type File = Express.Multer.File | undefined;

/**
 * ✅ Demandes de matériel : l'employé demande → le logisticien valide (quantités) → il sort le matériel.
 * La sortie crée les remises (bo_asset_assignments, sorties partielles) au nom du demandeur et un bon de sortie.
 * Logisticien = admin plateforme, propriétaire de l'entreprise ou utilisateur désigné (bo_logistics_managers).
 */
@Injectable()
export class MaterialRequestService {
  private readonly logger = new Logger(MaterialRequestService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly assets: AssetService,
    private readonly images: LogisticsImageService,
    private readonly notifications: NotificationsService,
    private readonly fcm: FcmService,
  ) { }

  private get m() {
    return this.dataSource.manager;
  }

  private t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params);
  }

  private company(user: UserEntity, companyId: string | undefined | null, lang: string) {
    return resolveCompanyId(this.dataSource, user, companyId, {
      required: this.t('asset.company_required', lang),
      forbidden: this.t('asset.forbidden', lang),
    });
  }

  private async assertManager(user: UserEntity, companyId: string, lang: string) {
    if (!(await isLogisticsManager(this.dataSource, user, companyId))) {
      throw new ForbiddenException(this.t('material_request.manager_only', lang));
    }
  }

  private async notify(userIds: string[], key: string, params: Record<string, any>, data: Record<string, any>, lang: string) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return;
    const title = this.t(`material_request.notif.${key}.title`, lang, params);
    const body = this.t(`material_request.notif.${key}.body`, lang, params);
    const payload = { category: 'logistics', event: key, ...data };
    try {
      await this.notifications.sendAndSaveNotificationToUsers(ids, title, body, NotificationType.LOGISTIC, payload);
    } catch (e: any) {
      this.logger.warn(`Notification demande de matériel : ${e?.message}`);
    }
    void this.fcm
      .sendPushToUsers(ids, title, body, { type: NotificationType.LOGISTIC, ...payload }, { tag: data.requestId ? `material-${data.requestId}` : undefined })
      .catch((e) => this.logger.warn(`Push demande de matériel : ${e?.message}`));
  }

  /** Propriétaires + logisticiens désignés de l'entreprise */
  private async managerIds(companyId: string): Promise<string[]> {
    const rows: { userId: string }[] = await this.dataSource.query(
      'SELECT `userId` FROM `user_has_company` WHERE `companyId` = ? AND `isOwner` = 1 UNION SELECT `userId` FROM `bo_logistics_managers` WHERE `companyId` = ?',
      [companyId, companyId],
    );
    return rows.map((r) => r.userId);
  }

  private async getRequest(id: string, user: UserEntity, lang: string): Promise<MaterialRequest> {
    const r = await this.m.findOne(MaterialRequest, { where: { id }, relations: ['items'] });
    if (!r) throw new NotFoundException(this.t('material_request.not_found', lang));
    await this.company(user, r.companyId, lang);
    return r;
  }

  private async detail(id: string) {
    const r = await this.m
      .createQueryBuilder(MaterialRequest, 'r')
      .leftJoinAndSelect('r.items', 'items')
      .leftJoin('items.asset', 'asset')
      .addSelect(['asset.id', 'asset.reference', 'asset.name', 'asset.unit', 'asset.quantityAvailable', 'asset.photoUrl'])
      .leftJoin('items.category', 'category')
      .addSelect(['category.id', 'category.name', 'category.photoUrl'])
      .leftJoin('r.requester', 'requester')
      .addSelect(['requester.id', 'requester.fullName', 'requester.phone', 'requester.email'])
      .leftJoin('r.reviewedBy', 'reviewedBy')
      .addSelect(['reviewedBy.id', 'reviewedBy.fullName'])
      .leftJoin('r.branch', 'branch')
      .addSelect(['branch.id', 'branch.name'])
      .where('r.id = :id', { id })
      .getOne();
    if (!r) return null;
    const assignments = await this.m.find(AssetAssignment, { where: { requestId: id }, relations: ['asset'], order: { assignedAt: 'ASC' } });
    return {
      ...r,
      issues: assignments.map((a) => ({
        assignmentId: a.id,
        assetId: a.assetId,
        reference: a.asset?.reference,
        name: a.asset?.name,
        unit: a.asset?.unit,
        quantity: a.quantity,
        returnedQuantity: a.returnedQuantity,
        status: a.status,
        assignedAt: a.assignedAt,
        photoUrl: a.photoUrl ?? null,
      })),
    };
  }

  // ============================================================
  // LOGISTICIENS DÉSIGNÉS (propriétaire / admin)
  // ============================================================
  async listManagers(user: UserEntity, lang: string, companyIdParam?: string) {
    const companyId = await this.company(user, companyIdParam, lang);
    const rows = await this.m.find(LogisticsManager, { where: { companyId }, relations: ['user'], order: { createdAt: 'ASC' } });
    const owners: any[] = await this.dataSource.query(
      'SELECT u.`id`, u.`fullName`, u.`phone`, u.`email` FROM `user_has_company` uhc JOIN `users` u ON u.`id` = uhc.`userId` WHERE uhc.`companyId` = ? AND uhc.`isOwner` = 1',
      [companyId],
    );
    return {
      message: this.t('material_request.managers', lang),
      data: {
        owners,
        managers: rows.map((r) => ({
          id: r.id,
          userId: r.userId,
          createdAt: r.createdAt,
          user: r.user ? { id: r.user.id, fullName: r.user.fullName, phone: r.user.phone, email: r.user.email } : null,
        })),
        canManage: await isLogisticsManager(this.dataSource, user, companyId),
      },
    };
  }

  async addManager(dto: AddLogisticsManagerDto, user: UserEntity, lang: string) {
    const companyId = await this.company(user, dto.companyId, lang);
    if (!(await isCompanyOwner(this.dataSource, user, companyId))) throw new ForbiddenException(this.t('material_request.owner_only', lang));
    await this.assets.checkEmployee(dto.userId, companyId, lang);
    const exists = await this.m.findOne(LogisticsManager, { where: { companyId, userId: dto.userId } });
    if (exists) return { message: this.t('material_request.manager_added', lang), data: exists };
    const row = await this.m.save(LogisticsManager, this.m.create(LogisticsManager, { companyId, userId: dto.userId, createdById: user.id }));
    return { message: this.t('material_request.manager_added', lang), data: row };
  }

  async removeManager(id: string, user: UserEntity, lang: string) {
    const row = await this.m.findOne(LogisticsManager, { where: { id } });
    if (!row) throw new NotFoundException(this.t('material_request.manager_not_found', lang));
    await this.company(user, row.companyId, lang);
    if (!(await isCompanyOwner(this.dataSource, user, row.companyId))) throw new ForbiddenException(this.t('material_request.owner_only', lang));
    await this.m.delete(LogisticsManager, { id });
    return { message: this.t('material_request.manager_removed', lang), data: { id } };
  }

  // ============================================================
  // DEMANDES
  // ============================================================
  async create(dto: CreateMaterialRequestDto, file: File, user: UserEntity, lang: string) {
    const companyId = await this.company(user, dto.companyId, lang);
    if (dto.branchId) {
      const branch = await this.m.findOne(BranchEntity, { where: { id: dto.branchId } });
      if (!branch || branch.deleted || (branch.company_id && branch.company_id !== companyId)) {
        throw new BadRequestException(this.t('asset.branch_not_found', lang));
      }
    }
    // Lignes : bien et catégorie de l'entreprise, description obligatoire sinon
    const assetIds = dto.items.map((i) => i.assetId).filter((x): x is string => !!x);
    const catIds = dto.items.map((i) => i.categoryId).filter((x): x is string => !!x);
    const assets = assetIds.length ? await this.m.find(Asset, { where: { id: In(assetIds), companyId } }) : [];
    const cats = catIds.length ? await this.m.find(AssetCategory, { where: { id: In(catIds), companyId } }) : [];
    if (assets.length !== new Set(assetIds).size) throw new BadRequestException(this.t('asset.not_found', lang));
    if (cats.length !== new Set(catIds).size) throw new BadRequestException(this.t('asset.category_not_found', lang));
    for (const it of dto.items) {
      if (!it.assetId && !it.categoryId && !it.description?.trim()) {
        throw new BadRequestException(this.t('material_request.item_description_required', lang));
      }
    }
    const photoUrl = (await this.images.upload(file)) ?? dto.photoUrl ?? null;

    const id = await this.dataSource.transaction(async (m) => {
      const req = await m.save(
        MaterialRequest,
        m.create(MaterialRequest, {
          companyId,
          reference: reference('DEM'),
          requesterId: user.id,
          branchId: dto.branchId ?? null,
          reason: dto.reason.trim(),
          priority: dto.priority ?? MaterialRequestPriority.NORMAL,
          neededBy: dto.neededBy ? dto.neededBy.slice(0, 10) : null,
          status: MaterialRequestStatus.PENDING,
          photoUrl,
        }),
      );
      await m.insert(
        MaterialRequestItem,
        dto.items.map((it) => {
          const asset = assets.find((a) => a.id === it.assetId);
          const cat = cats.find((c) => c.id === it.categoryId);
          return {
            requestId: req.id,
            assetId: it.assetId ?? null,
            categoryId: it.categoryId ?? asset?.categoryId ?? null,
            description: (it.description?.trim() || asset?.name || cat?.name || '').slice(0, 255),
            quantityRequested: it.quantity,
            quantityApproved: null,
            quantityIssued: 0,
          };
        }),
      );
      return req.id;
    });

    const managers = (await this.managerIds(companyId)).filter((u) => u !== user.id);
    await this.notify(managers, 'new_request', { name: user.fullName || '', count: dto.items.length }, { requestId: id }, lang);
    return { message: this.t('material_request.created', lang), data: await this.detail(id) };
  }

  async list(query: MaterialRequestQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.company(user, query.companyId, lang);
    const manager = await isLogisticsManager(this.dataSource, user, companyId);
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const qb = this.m
      .createQueryBuilder(MaterialRequest, 'r')
      .leftJoinAndSelect('r.items', 'items')
      .leftJoin('r.requester', 'requester')
      .addSelect(['requester.id', 'requester.fullName', 'requester.phone'])
      .leftJoin('r.branch', 'branch')
      .addSelect(['branch.id', 'branch.name'])
      .where('r.companyId = :companyId', { companyId });
    // Un employé (non logisticien) ne voit que ses demandes
    if (!manager || query.mine === 'true') qb.andWhere('r.requesterId = :me', { me: user.id });
    else if (query.requesterId) qb.andWhere('r.requesterId = :rid', { rid: query.requesterId });
    if (query.status) qb.andWhere('r.status = :status', { status: query.status });
    if (query.search?.trim()) {
      const kw = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(new Brackets((w) => w.where('LOWER(r.reference) LIKE :kw', { kw }).orWhere('LOWER(r.reason) LIKE :kw', { kw }).orWhere('LOWER(requester.fullName) LIKE :kw', { kw })));
    }
    const [items, total] = await qb.orderBy('r.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
    return { message: this.t('material_request.list', lang), data: { ...new PaginatedResponseDto(items, total, page, limit), canManage: manager } };
  }

  async findOne(id: string, user: UserEntity, lang: string) {
    const r = await this.getRequest(id, user, lang);
    if (r.requesterId !== user.id) await this.assertManager(user, r.companyId, lang);
    return { message: this.t('material_request.detail', lang), data: await this.detail(id) };
  }

  /** Validation (quantités accordées par ligne) */
  async approve(id: string, dto: ApproveMaterialRequestDto, user: UserEntity, lang: string) {
    const r = await this.getRequest(id, user, lang);
    await this.assertManager(user, r.companyId, lang);
    if (r.status !== MaterialRequestStatus.PENDING) throw new BadRequestException(this.t('material_request.not_pending', lang));
    const byId = new Map((dto.items ?? []).map((i) => [i.itemId, i.quantityApproved]));
    for (const k of byId.keys()) if (!r.items.some((i) => i.id === k)) throw new BadRequestException(this.t('material_request.item_not_found', lang));
    await this.dataSource.transaction(async (m) => {
      for (const it of r.items) {
        const q = byId.has(it.id) ? byId.get(it.id)! : it.quantityRequested;
        await m.update(MaterialRequestItem, { id: it.id }, { quantityApproved: Math.min(q, it.quantityRequested) });
      }
      const total = r.items.reduce((s, it) => s + Math.min(byId.has(it.id) ? byId.get(it.id)! : it.quantityRequested, it.quantityRequested), 0);
      await m.update(MaterialRequest, { id }, {
        status: total > 0 ? MaterialRequestStatus.APPROVED : MaterialRequestStatus.REJECTED,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: dto.note ?? null,
      });
    });
    const fresh = await this.detail(id);
    await this.notify(
      [r.requesterId],
      fresh?.status === MaterialRequestStatus.REJECTED ? 'rejected' : 'approved',
      { reference: r.reference, note: dto.note || '' },
      { requestId: id },
      lang,
    );
    return { message: this.t(fresh?.status === MaterialRequestStatus.REJECTED ? 'material_request.rejected' : 'material_request.approved', lang), data: fresh };
  }

  async reject(id: string, dto: RejectMaterialRequestDto, user: UserEntity, lang: string) {
    const r = await this.getRequest(id, user, lang);
    await this.assertManager(user, r.companyId, lang);
    if (r.status !== MaterialRequestStatus.PENDING && r.status !== MaterialRequestStatus.APPROVED) {
      throw new BadRequestException(this.t('material_request.cannot_reject', lang));
    }
    await this.m.update(MaterialRequest, { id }, { status: MaterialRequestStatus.REJECTED, reviewedById: user.id, reviewedAt: new Date(), reviewNote: dto.note });
    await this.notify([r.requesterId], 'rejected', { reference: r.reference, note: dto.note }, { requestId: id }, lang);
    return { message: this.t('material_request.rejected', lang), data: await this.detail(id) };
  }

  /** Annulation par le demandeur (tant que rien n'est sorti) */
  async cancel(id: string, user: UserEntity, lang: string) {
    const r = await this.getRequest(id, user, lang);
    if (r.requesterId !== user.id) await this.assertManager(user, r.companyId, lang);
    if (r.status !== MaterialRequestStatus.PENDING && r.status !== MaterialRequestStatus.APPROVED) {
      throw new BadRequestException(this.t('material_request.cannot_cancel', lang));
    }
    await this.m.update(MaterialRequest, { id }, { status: MaterialRequestStatus.CANCELLED });
    return { message: this.t('material_request.cancelled', lang), data: await this.detail(id) };
  }

  /**
   * Sortie du matériel accordé : pour chaque ligne, un bien du stock et une quantité
   * (≤ accordé − déjà sorti, ≤ stock disponible). Crée les remises au nom du demandeur.
   */
  async issue(id: string, dto: IssueMaterialRequestDto, file: File, user: UserEntity, lang: string) {
    const r = await this.getRequest(id, user, lang);
    await this.assertManager(user, r.companyId, lang);
    if (r.status !== MaterialRequestStatus.APPROVED && r.status !== MaterialRequestStatus.PARTIALLY_ISSUED) {
      throw new BadRequestException(this.t('material_request.not_approved', lang));
    }
    const photoUrl = (await this.images.upload(file)) ?? dto.photoUrl ?? null;

    const assignmentIds = await this.dataSource.transaction(async (m) => {
      const ids: string[] = [];
      for (const line of dto.lines) {
        const item = await m.findOne(MaterialRequestItem, { where: { id: line.itemId, requestId: id } });
        if (!item) throw new BadRequestException(this.t('material_request.item_not_found', lang));
        const assetId = line.assetId ?? item.assetId;
        if (!assetId) throw new BadRequestException(this.t('material_request.asset_required', lang, { item: item.description }));
        const asset = await m.findOne(Asset, { where: { id: assetId, companyId: r.companyId } });
        if (!asset) throw new NotFoundException(this.t('asset.not_found', lang));
        if (item.categoryId && !item.assetId && asset.categoryId !== item.categoryId) {
          throw new BadRequestException(this.t('material_request.asset_wrong_category', lang, { name: asset.name }));
        }
        const remaining = (item.quantityApproved ?? item.quantityRequested) - item.quantityIssued;
        if (line.quantity > remaining) {
          throw new BadRequestException(this.t('material_request.issue_too_much', lang, { item: item.description, remaining }));
        }
        const a = await this.assets.assignInternal(m, asset, r.requesterId, line.quantity, user, lang, {
          requestId: id,
          note: [r.reference, dto.note].filter(Boolean).join(' — '),
          photoUrl,
        });
        ids.push(a.id);
        item.quantityIssued += line.quantity;
        await m.save(MaterialRequestItem, item);
      }
      const items = await m.find(MaterialRequestItem, { where: { requestId: id } });
      const done = items.every((it) => it.quantityIssued >= (it.quantityApproved ?? it.quantityRequested));
      await m.update(MaterialRequest, { id }, {
        status: done ? MaterialRequestStatus.ISSUED : MaterialRequestStatus.PARTIALLY_ISSUED,
        issuedAt: new Date(),
      });
      return ids;
    });

    await this.notify([r.requesterId], 'issued', { reference: r.reference }, { requestId: id }, lang);
    return {
      message: this.t('material_request.issued', lang),
      data: {
        request: await this.detail(id),
        deliveryNote: await this.assets.deliveryNote([...new Set<string>(assignmentIds)], r.companyId, user, lang),
      },
    };
  }

  /** Bon de sortie de toute la demande */
  async deliveryNote(id: string, user: UserEntity, lang: string) {
    const r = await this.getRequest(id, user, lang);
    if (r.requesterId !== user.id) await this.assertManager(user, r.companyId, lang);
    const rows = await this.m.find(AssetAssignment, { where: { requestId: id }, select: ['id'] });
    if (!rows.length) throw new BadRequestException(this.t('material_request.nothing_issued', lang));
    const note = await this.assets.deliveryNote(rows.map((x) => x.id), r.companyId, user, lang);
    return { message: this.t('asset.delivery_note', lang), data: { ...note, request: { id: r.id, reference: r.reference, reason: r.reason } } };
  }
}
