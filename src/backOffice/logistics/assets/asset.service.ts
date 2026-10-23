import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, Brackets, DataSource, EntityManager, IsNull, Not } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { AssetCondition, AssetMovementType, AssetStatus } from '../common/logistics.enums';
import { isPlatformAdmin, pageParams, resolveCompanyId } from '../common/logistics-access';
import { Asset } from './entities/asset.entity';
import { AssetCategory } from './entities/asset-category.entity';
import { AssetMovement } from './entities/asset-movement.entity';
import {
  AssetMovementQueryDto,
  AssetNoteDto,
  AssetQueryDto,
  AssignAssetDto,
  CheckAssetDto,
  ConditionAssetDto,
  CreateAssetCategoryDto,
  CreateAssetDto,
  DisposeAssetDto,
  RepairAssetDto,
  ReturnAssetDto,
  TransferAssetDto,
  UpdateAssetCategoryDto,
  UpdateAssetDto,
} from './dto/asset.dto';

/**
 * Logistique interne : biens de l'entreprise (patrimoine).
 * Inventaire, affectation aux employés, transfert entre branches, réparation,
 * contrôle d'inventaire, sortie du patrimoine et historique de chaque bien.
 */
@Injectable()
export class AssetService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
  ) { }

  private t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params);
  }

  private company(user: UserEntity, companyId: string | undefined | null, lang: string) {
    return resolveCompanyId(this.dataSource, user, companyId, {
      required: this.t('asset.company_required', lang),
      forbidden: this.t('asset.forbidden', lang),
    });
  }

  // ============================================================
  // OUTILS
  // ============================================================

  /** Valeur actuelle (amortissement linéaire) */
  private currentValue(asset: Asset): number | null {
    const cost = asset.acquisitionCost;
    if (cost === null || cost === undefined) return null;
    const years = asset.depreciationYears ?? asset.category?.depreciationYears ?? null;
    if (!years || !asset.acquisitionDate) return Number(cost);
    const elapsed = (Date.now() - new Date(asset.acquisitionDate).getTime()) / (365.25 * 86400000);
    return Math.round(Math.max(0, Number(cost) * (1 - elapsed / years)) * 100) / 100;
  }

  private present(asset: Asset) {
    return { ...asset, currentValue: this.currentValue(asset) };
  }

  private async checkBranch(branchId: string | undefined | null, companyId: string, lang: string): Promise<BranchEntity | null> {
    if (!branchId) return null;
    const branch = await this.dataSource.manager.findOne(BranchEntity, { where: { id: branchId } });
    if (!branch || branch.deleted) throw new NotFoundException(this.t('asset.branch_not_found', lang));
    if (branch.company_id && branch.company_id !== companyId) {
      throw new BadRequestException(this.t('asset.branch_other_company', lang));
    }
    return branch;
  }

  /** L'employé doit appartenir à l'entreprise */
  private async checkEmployee(userId: string, companyId: string, lang: string): Promise<UserEntity> {
    const user = await this.dataSource.manager.findOne(UserEntity, { where: { id: userId } });
    if (!user) throw new NotFoundException(this.t('asset.user_not_found', lang));
    const rows = await this.dataSource.query(
      'SELECT 1 FROM `user_has_company` WHERE `userId` = ? AND `companyId` = ? LIMIT 1',
      [userId, companyId],
    );
    if (!Array.isArray(rows) || !rows.length) throw new BadRequestException(this.t('asset.user_not_in_company', lang));
    return user;
  }

  private async checkCategory(categoryId: string | undefined | null, companyId: string, lang: string) {
    if (!categoryId) return null;
    const cat = await this.dataSource.manager.findOne(AssetCategory, { where: { id: categoryId } });
    if (!cat || cat.companyId !== companyId) throw new NotFoundException(this.t('asset.category_not_found', lang));
    return cat;
  }

  /** Code d'inventaire unique : <CODE CATÉGORIE ou AST>-000001 */
  private async nextReference(m: EntityManager, companyId: string, prefix: string): Promise<string> {
    const p = (prefix || 'AST').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'AST';
    const count = await m.count(Asset, { where: { companyId } });
    for (let n = count + 1; n < count + 1000; n++) {
      const ref = `${p}-${String(n).padStart(6, '0')}`;
      const exists = await m.count(Asset, { where: { companyId, reference: ref } });
      if (!exists) return ref;
    }
    return `${p}-${Date.now()}`;
  }

  private async getAsset(id: string, user: UserEntity, lang: string, m?: EntityManager): Promise<Asset> {
    const asset = await (m ?? this.dataSource.manager).findOne(Asset, { where: { id }, relations: ['category'] });
    if (!asset) throw new NotFoundException(this.t('asset.not_found', lang));
    await this.company(user, asset.companyId, lang);
    return asset;
  }

  private assertNotClosed(asset: Asset, lang: string) {
    if (asset.status === AssetStatus.DISPOSED) throw new BadRequestException(this.t('asset.disposed', lang));
  }

  private async log(
    m: EntityManager,
    asset: Asset,
    type: AssetMovementType,
    user: UserEntity | null,
    data: Partial<AssetMovement> = {},
  ) {
    await m.insert(AssetMovement, {
      assetId: asset.id,
      companyId: asset.companyId,
      type,
      performedById: user?.id ?? null,
      ...data,
    });
  }

  // ============================================================
  // CATÉGORIES
  // ============================================================

  async createCategory(dto: CreateAssetCategoryDto, user: UserEntity, lang: string) {
    const companyId = await this.company(user, dto.companyId, lang);
    const name = dto.name.trim();
    const dup = await this.dataSource.manager.count(AssetCategory, { where: { companyId, name } });
    if (dup) throw new ConflictException(this.t('asset.category_exists', lang, { name }));
    const cat = await this.dataSource.manager.save(
      AssetCategory,
      this.dataSource.manager.create(AssetCategory, {
        ...dto,
        companyId,
        name,
        code: dto.code ? dto.code.toUpperCase() : null,
        isActive: dto.isActive ?? true,
      }),
    );
    return { message: this.t('asset.category_created', lang), data: cat };
  }

  async listCategories(user: UserEntity, lang: string, companyIdParam?: string) {
    const companyId = await this.company(user, companyIdParam, lang);
    const rows = await this.dataSource.manager.find(AssetCategory, { where: { companyId }, order: { name: 'ASC' } });
    const counts = await this.dataSource.manager
      .createQueryBuilder(Asset, 'a')
      .select('a.categoryId', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .where('a.companyId = :companyId', { companyId })
      .andWhere('a.status != :disposed', { disposed: AssetStatus.DISPOSED })
      .groupBy('a.categoryId')
      .getRawMany();
    const byCat = new Map(counts.map((c) => [c.categoryId, Number(c.count)]));
    return {
      message: this.t('asset.categories', lang),
      data: rows.map((c: any) => ({ ...c, assetsCount: byCat.get(c.id) ?? 0 })),
    };
  }

  async updateCategory(id: string, dto: UpdateAssetCategoryDto, user: UserEntity, lang: string) {
    const cat = await this.dataSource.manager.findOne(AssetCategory, { where: { id } });
    if (!cat) throw new NotFoundException(this.t('asset.category_not_found', lang));
    await this.company(user, cat.companyId, lang);
    if (dto.name && dto.name.trim() !== cat.name) {
      const dup = await this.dataSource.manager.count(AssetCategory, {
        where: { companyId: cat.companyId, name: dto.name.trim(), id: Not(id) },
      });
      if (dup) throw new ConflictException(this.t('asset.category_exists', lang, { name: dto.name }));
    }
    const { companyId: _c, ...data } = dto;
    Object.assign(cat, data, dto.name ? { name: dto.name.trim() } : {}, dto.code ? { code: dto.code.toUpperCase() } : {});
    return { message: this.t('asset.category_updated', lang), data: await this.dataSource.manager.save(AssetCategory, cat) };
  }

  async deleteCategory(id: string, user: UserEntity, lang: string) {
    const cat = await this.dataSource.manager.findOne(AssetCategory, { where: { id } });
    if (!cat) throw new NotFoundException(this.t('asset.category_not_found', lang));
    await this.company(user, cat.companyId, lang);
    const used = await this.dataSource.manager.count(Asset, { where: { categoryId: id } });
    if (used) throw new BadRequestException(this.t('asset.category_in_use', lang, { count: used }));
    await this.dataSource.manager.delete(AssetCategory, { id });
    return { message: this.t('asset.category_deleted', lang), data: { id } };
  }

  // ============================================================
  // BIENS
  // ============================================================

  async create(dto: CreateAssetDto, user: UserEntity, lang: string) {
    const companyId = await this.company(user, dto.companyId, lang);
    const category = await this.checkCategory(dto.categoryId, companyId, lang);
    await this.checkBranch(dto.branchId, companyId, lang);
    if (dto.assignedToUserId) await this.checkEmployee(dto.assignedToUserId, companyId, lang);

    const asset = await this.dataSource.transaction(async (m) => {
      let reference = dto.reference?.trim();
      if (reference) {
        const dup = await m.count(Asset, { where: { companyId, reference } });
        if (dup) throw new ConflictException(this.t('asset.reference_exists', lang, { reference }));
      } else {
        reference = await this.nextReference(m, companyId, category?.code || 'AST');
      }
      const saved = await m.save(
        Asset,
        m.create(Asset, {
          ...dto,
          companyId,
          reference,
          quantity: dto.quantity ?? 1,
          condition: dto.condition ?? AssetCondition.NEW,
          currency: dto.currency || 'USD',
          status: dto.assignedToUserId ? AssetStatus.IN_USE : AssetStatus.AVAILABLE,
          assignedAt: dto.assignedToUserId ? new Date() : null,
          createdById: user?.id ?? null,
        }),
      );
      await this.log(m, saved, AssetMovementType.ACQUIRED, user, {
        toBranchId: saved.branchId ?? null,
        toStatus: AssetStatus.AVAILABLE,
        toCondition: saved.condition,
        location: saved.location ?? null,
        amount: saved.acquisitionCost ?? null,
        note: dto.supplier ? `Fournisseur : ${dto.supplier}` : null,
      });
      if (dto.assignedToUserId) {
        await this.log(m, saved, AssetMovementType.ASSIGNED, user, {
          toUserId: dto.assignedToUserId,
          fromStatus: AssetStatus.AVAILABLE,
          toStatus: AssetStatus.IN_USE,
        });
      }
      return saved;
    });

    return { message: this.t('asset.created', lang, { reference: asset.reference }), data: await this.detailData(asset.id) };
  }

  async update(id: string, dto: UpdateAssetDto, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    if (dto.categoryId !== undefined) await this.checkCategory(dto.categoryId, asset.companyId, lang);
    if (dto.reference && dto.reference.trim() !== asset.reference) {
      const dup = await this.dataSource.manager.count(Asset, {
        where: { companyId: asset.companyId, reference: dto.reference.trim(), id: Not(id) },
      });
      if (dup) throw new ConflictException(this.t('asset.reference_exists', lang, { reference: dto.reference }));
      dto.reference = dto.reference.trim();
    }
    await this.dataSource.transaction(async (m) => {
      Object.assign(asset, dto);
      delete (asset as any).category;
      await m.save(Asset, asset);
      await this.log(m, asset, AssetMovementType.UPDATED, user, { note: Object.keys(dto).join(', ').slice(0, 500) });
    });
    return { message: this.t('asset.updated', lang), data: await this.detailData(id) };
  }

  private async detailData(id: string) {
    const asset = await this.dataSource.manager.findOne(Asset, {
      where: { id },
      relations: ['category', 'branch', 'assignedTo'],
    });
    if (!asset) return null;
    const a: any = this.present(asset);
    if (a.assignedTo) a.assignedTo = { id: a.assignedTo.id, fullName: a.assignedTo.fullName, phone: a.assignedTo.phone, email: a.assignedTo.email };
    return a;
  }

  async findOne(id: string, user: UserEntity, lang: string) {
    await this.getAsset(id, user, lang);
    const movements = await this.dataSource.manager.find(AssetMovement, {
      where: { assetId: id },
      relations: ['performedBy'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return {
      message: this.t('asset.detail', lang),
      data: {
        ...(await this.detailData(id)),
        movements: movements.map((mv) => ({
          ...mv,
          performedBy: mv.performedBy ? { id: mv.performedBy.id, fullName: mv.performedBy.fullName } : null,
        })),
      },
    };
  }

  async list(query: AssetQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.company(user, query.companyId, lang);
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const qb = this.dataSource.manager
      .createQueryBuilder(Asset, 'a')
      .leftJoinAndSelect('a.category', 'category')
      .leftJoinAndSelect('a.branch', 'branch')
      .leftJoin('a.assignedTo', 'assignedTo')
      .addSelect(['assignedTo.id', 'assignedTo.fullName', 'assignedTo.phone'])
      .where('a.companyId = :companyId', { companyId });

    if (query.status) qb.andWhere('a.status = :status', { status: query.status });
    else if (query.includeDisposed !== 'true') qb.andWhere('a.status != :disposed', { disposed: AssetStatus.DISPOSED });
    if (query.branchId) qb.andWhere('a.branchId = :branchId', { branchId: query.branchId });
    if (query.categoryId) qb.andWhere('a.categoryId = :categoryId', { categoryId: query.categoryId });
    if (query.condition) qb.andWhere('a.condition = :condition', { condition: query.condition });
    if (query.assignedToUserId) qb.andWhere('a.assignedToUserId = :uid', { uid: query.assignedToUserId });
    if (query.warrantyExpiring === 'true') {
      const today = new Date().toISOString().slice(0, 10);
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      qb.andWhere('a.warrantyEndDate BETWEEN :today AND :in30', { today, in30 });
    }
    if (query.search?.trim()) {
      const kw = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('LOWER(a.name) LIKE :kw', { kw })
            .orWhere('LOWER(a.reference) LIKE :kw', { kw })
            .orWhere('LOWER(a.serialNumber) LIKE :kw', { kw })
            .orWhere('LOWER(a.barcode) LIKE :kw', { kw })
            .orWhere('LOWER(a.brand) LIKE :kw', { kw })
            .orWhere('LOWER(a.model) LIKE :kw', { kw })
            .orWhere('LOWER(assignedTo.fullName) LIKE :kw', { kw }),
        ),
      );
    }
    const [items, total] = await qb.orderBy('a.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
    return {
      message: this.t('asset.list', lang),
      data: new PaginatedResponseDto(items.map((a) => this.present(a)) as any, total, page, limit),
    };
  }

  /** Biens affectés à un employé (« ses équipements ») */
  async byUser(userId: string, user: UserEntity, lang: string, companyIdParam?: string) {
    const companyId = await this.company(user, companyIdParam, lang);
    const items = await this.dataSource.manager.find(Asset, {
      where: { companyId, assignedToUserId: userId, status: AssetStatus.IN_USE },
      relations: ['category', 'branch'],
      order: { assignedAt: 'DESC' },
    });
    return { message: this.t('asset.user_assets', lang), data: items.map((a) => this.present(a)) };
  }

  /** Recherche rapide par code d'inventaire / code-barres / n° de série (scan) */
  async findByCode(code: string, user: UserEntity, lang: string, companyIdParam?: string) {
    const companyId = await this.company(user, companyIdParam, lang);
    const c = code.trim();
    const asset = await this.dataSource.manager.findOne(Asset, {
      where: [
        { companyId, reference: c },
        { companyId, barcode: c },
        { companyId, serialNumber: c },
      ],
    });
    if (!asset) throw new NotFoundException(this.t('asset.not_found', lang));
    return this.findOne(asset.id, user, lang);
  }

  // ============================================================
  // ACTIONS
  // ============================================================

  async assign(id: string, dto: AssignAssetDto, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    this.assertNotClosed(asset, lang);
    if ([AssetStatus.IN_REPAIR, AssetStatus.LOST].includes(asset.status)) {
      throw new BadRequestException(this.t('asset.not_available', lang, { status: asset.status }));
    }
    await this.checkEmployee(dto.userId, asset.companyId, lang);
    const branch = await this.checkBranch(dto.branchId, asset.companyId, lang);

    await this.dataSource.transaction(async (m) => {
      const from = { status: asset.status, userId: asset.assignedToUserId ?? null, branchId: asset.branchId ?? null };
      asset.status = AssetStatus.IN_USE;
      asset.assignedToUserId = dto.userId;
      asset.assignedAt = new Date();
      if (branch) asset.branchId = branch.id;
      if (dto.location) asset.location = dto.location;
      delete (asset as any).category;
      await m.save(Asset, asset);
      await this.log(m, asset, AssetMovementType.ASSIGNED, user, {
        fromUserId: from.userId,
        toUserId: dto.userId,
        fromBranchId: from.branchId,
        toBranchId: asset.branchId ?? null,
        fromStatus: from.status,
        toStatus: AssetStatus.IN_USE,
        location: asset.location ?? null,
        note: dto.note ?? null,
      });
    });
    return { message: this.t('asset.assigned', lang), data: await this.detailData(id) };
  }

  async returnAsset(id: string, dto: ReturnAssetDto, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    if (asset.status !== AssetStatus.IN_USE) throw new BadRequestException(this.t('asset.not_assigned', lang));
    const branch = await this.checkBranch(dto.branchId, asset.companyId, lang);

    await this.dataSource.transaction(async (m) => {
      const fromUser = asset.assignedToUserId ?? null;
      const fromCondition = asset.condition;
      asset.status = AssetStatus.AVAILABLE;
      asset.assignedToUserId = null;
      asset.assignedAt = null;
      if (branch) asset.branchId = branch.id;
      if (dto.location) asset.location = dto.location;
      if (dto.condition) asset.condition = dto.condition;
      delete (asset as any).category;
      await m.save(Asset, asset);
      await this.log(m, asset, AssetMovementType.RETURNED, user, {
        fromUserId: fromUser,
        fromStatus: AssetStatus.IN_USE,
        toStatus: AssetStatus.AVAILABLE,
        toBranchId: asset.branchId ?? null,
        fromCondition,
        toCondition: asset.condition,
        location: asset.location ?? null,
        note: dto.note ?? null,
      });
    });
    return { message: this.t('asset.returned', lang), data: await this.detailData(id) };
  }

  async transfer(id: string, dto: TransferAssetDto, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    this.assertNotClosed(asset, lang);
    const branch = await this.checkBranch(dto.toBranchId, asset.companyId, lang);
    if (asset.branchId === dto.toBranchId && (!dto.location || dto.location === asset.location)) {
      throw new BadRequestException(this.t('asset.same_branch', lang));
    }
    await this.dataSource.transaction(async (m) => {
      const fromBranch = asset.branchId ?? null;
      const fromLocation = asset.location ?? null;
      asset.branchId = branch!.id;
      asset.location = dto.location ?? null;
      delete (asset as any).category;
      await m.save(Asset, asset);
      await this.log(m, asset, AssetMovementType.TRANSFERRED, user, {
        fromBranchId: fromBranch,
        toBranchId: asset.branchId,
        location: asset.location ?? null,
        note: [dto.note, fromLocation ? `Ancien emplacement : ${fromLocation}` : null].filter(Boolean).join(' — ') || null,
      });
    });
    return { message: this.t('asset.transferred', lang, { branch: branch!.name }), data: await this.detailData(id) };
  }

  async repair(id: string, dto: RepairAssetDto, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    this.assertNotClosed(asset, lang);
    if (dto.action === 'SEND' && asset.status === AssetStatus.IN_REPAIR) {
      throw new BadRequestException(this.t('asset.already_in_repair', lang));
    }
    if (dto.action === 'RETURN' && asset.status !== AssetStatus.IN_REPAIR) {
      throw new BadRequestException(this.t('asset.not_in_repair', lang));
    }
    await this.dataSource.transaction(async (m) => {
      const fromStatus = asset.status;
      const fromCondition = asset.condition;
      if (dto.action === 'SEND') {
        asset.status = AssetStatus.IN_REPAIR;
      } else {
        // Retour : de nouveau chez l'employé s'il était affecté, sinon disponible
        asset.status = asset.assignedToUserId ? AssetStatus.IN_USE : AssetStatus.AVAILABLE;
      }
      if (dto.condition) asset.condition = dto.condition;
      delete (asset as any).category;
      await m.save(Asset, asset);
      await this.log(m, asset, dto.action === 'SEND' ? AssetMovementType.REPAIR_SENT : AssetMovementType.REPAIR_RETURNED, user, {
        fromStatus,
        toStatus: asset.status,
        fromCondition,
        toCondition: asset.condition,
        amount: dto.cost ?? null,
        note: dto.note ?? null,
      });
    });
    return {
      message: this.t(dto.action === 'SEND' ? 'asset.repair_sent' : 'asset.repair_returned', lang),
      data: await this.detailData(id),
    };
  }

  async changeCondition(id: string, dto: ConditionAssetDto, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    this.assertNotClosed(asset, lang);
    if (asset.condition === dto.condition) return { message: this.t('asset.condition_changed', lang), data: await this.detailData(id) };
    await this.dataSource.transaction(async (m) => {
      const from = asset.condition;
      asset.condition = dto.condition;
      delete (asset as any).category;
      await m.save(Asset, asset);
      await this.log(m, asset, AssetMovementType.CONDITION_CHANGED, user, {
        fromCondition: from,
        toCondition: dto.condition,
        note: dto.note ?? null,
      });
    });
    return { message: this.t('asset.condition_changed', lang), data: await this.detailData(id) };
  }

  /** Contrôle d'inventaire : le bien a été vu (état, emplacement, quantité comptée) */
  async check(id: string, dto: CheckAssetDto, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    this.assertNotClosed(asset, lang);
    await this.dataSource.transaction(async (m) => {
      const fromCondition = asset.condition;
      const fromStatus = asset.status;
      asset.lastCheckedAt = new Date();
      if (dto.condition) asset.condition = dto.condition;
      if (dto.location) asset.location = dto.location;
      if (asset.status === AssetStatus.LOST) asset.status = asset.assignedToUserId ? AssetStatus.IN_USE : AssetStatus.AVAILABLE;
      const diff = dto.countedQuantity !== undefined && dto.countedQuantity !== asset.quantity
        ? ` — quantité comptée ${dto.countedQuantity} / ${asset.quantity}`
        : '';
      delete (asset as any).category;
      await m.save(Asset, asset);
      await this.log(m, asset, AssetMovementType.INVENTORY_CHECK, user, {
        fromStatus,
        toStatus: asset.status,
        fromCondition,
        toCondition: asset.condition,
        location: asset.location ?? null,
        note: `${dto.note ?? ''}${diff}`.trim() || null,
      });
    });
    return { message: this.t('asset.checked', lang), data: await this.detailData(id) };
  }

  async markLost(id: string, dto: AssetNoteDto, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    this.assertNotClosed(asset, lang);
    if (asset.status === AssetStatus.LOST) throw new BadRequestException(this.t('asset.already_lost', lang));
    await this.dataSource.transaction(async (m) => {
      const from = asset.status;
      asset.status = AssetStatus.LOST;
      delete (asset as any).category;
      await m.save(Asset, asset);
      await this.log(m, asset, AssetMovementType.LOST, user, {
        fromStatus: from,
        toStatus: AssetStatus.LOST,
        fromUserId: asset.assignedToUserId ?? null,
        note: dto.note ?? null,
      });
    });
    return { message: this.t('asset.lost', lang), data: await this.detailData(id) };
  }

  async markFound(id: string, dto: AssetNoteDto, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    if (asset.status !== AssetStatus.LOST) throw new BadRequestException(this.t('asset.not_lost', lang));
    await this.dataSource.transaction(async (m) => {
      asset.status = asset.assignedToUserId ? AssetStatus.IN_USE : AssetStatus.AVAILABLE;
      delete (asset as any).category;
      await m.save(Asset, asset);
      await this.log(m, asset, AssetMovementType.FOUND, user, {
        fromStatus: AssetStatus.LOST,
        toStatus: asset.status,
        note: dto.note ?? null,
      });
    });
    return { message: this.t('asset.found', lang), data: await this.detailData(id) };
  }

  /** Sortie du patrimoine (vendu, donné, détruit, volé) — le bien et son historique sont conservés */
  async dispose(id: string, dto: DisposeAssetDto, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    this.assertNotClosed(asset, lang);
    await this.dataSource.transaction(async (m) => {
      const from = asset.status;
      const fromUser = asset.assignedToUserId ?? null;
      asset.status = AssetStatus.DISPOSED;
      asset.disposalReason = dto.reason;
      asset.disposalDate = dto.disposalDate ?? new Date().toISOString().slice(0, 10);
      asset.disposalValue = dto.disposalValue ?? null;
      asset.assignedToUserId = null;
      asset.assignedAt = null;
      delete (asset as any).category;
      await m.save(Asset, asset);
      await this.log(m, asset, AssetMovementType.DISPOSED, user, {
        fromStatus: from,
        toStatus: AssetStatus.DISPOSED,
        fromUserId: fromUser,
        amount: dto.disposalValue ?? null,
        note: [dto.reason, dto.note].filter(Boolean).join(' — '),
      });
    });
    return { message: this.t('asset.disposed_ok', lang), data: await this.detailData(id) };
  }

  // ============================================================
  // JOURNAL + TABLEAU DE BORD
  // ============================================================

  async movements(query: AssetMovementQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.company(user, query.companyId, lang);
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const qb = this.dataSource.manager
      .createQueryBuilder(AssetMovement, 'mv')
      .leftJoin('mv.asset', 'asset')
      .addSelect(['asset.id', 'asset.reference', 'asset.name'])
      .leftJoin('mv.performedBy', 'performedBy')
      .addSelect(['performedBy.id', 'performedBy.fullName'])
      .where('mv.companyId = :companyId', { companyId });
    if (query.assetId) qb.andWhere('mv.assetId = :assetId', { assetId: query.assetId });
    if (query.type) qb.andWhere('mv.type = :type', { type: query.type });
    if (query.branchId) qb.andWhere('(mv.fromBranchId = :b OR mv.toBranchId = :b)', { b: query.branchId });
    if (query.userId) qb.andWhere('(mv.fromUserId = :u OR mv.toUserId = :u)', { u: query.userId });
    if (query.from) qb.andWhere('mv.createdAt >= :from', { from: new Date(`${query.from}T00:00:00`) });
    if (query.to) qb.andWhere('mv.createdAt <= :to', { to: new Date(`${query.to}T23:59:59.999`) });
    const [items, total] = await qb.orderBy('mv.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();
    return { message: this.t('asset.movements', lang), data: new PaginatedResponseDto(items, total, page, limit) };
  }

  async dashboard(user: UserEntity, lang: string, companyIdParam?: string) {
    const companyId = await this.company(user, companyIdParam, lang);
    const m = this.dataSource.manager;

    const byStatus = await m
      .createQueryBuilder(Asset, 'a')
      .select('a.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(a.quantity), 0)', 'units')
      .where('a.companyId = :companyId', { companyId })
      .groupBy('a.status')
      .getRawMany();

    const byCategory = await m
      .createQueryBuilder(Asset, 'a')
      .leftJoin('a.category', 'c')
      .select('c.id', 'categoryId')
      .addSelect('c.name', 'category')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(a.acquisitionCost), 0)', 'value')
      .where('a.companyId = :companyId', { companyId })
      .andWhere('a.status != :disposed', { disposed: AssetStatus.DISPOSED })
      .groupBy('c.id')
      .addGroupBy('c.name')
      .getRawMany();

    const byBranch = await m
      .createQueryBuilder(Asset, 'a')
      .leftJoin('a.branch', 'b')
      .select('b.id', 'branchId')
      .addSelect('b.name', 'branch')
      .addSelect('COUNT(*)', 'count')
      .where('a.companyId = :companyId', { companyId })
      .andWhere('a.status != :disposed', { disposed: AssetStatus.DISPOSED })
      .groupBy('b.id')
      .addGroupBy('b.name')
      .getRawMany();

    // Valeur d'achat et valeur actuelle (amortissement) des biens en patrimoine
    const active = await m.find(Asset, {
      where: { companyId, status: Not(AssetStatus.DISPOSED) },
      relations: ['category'],
      select: { id: true, acquisitionCost: true, acquisitionDate: true, depreciationYears: true, currency: true, category: { id: true, depreciationYears: true } } as any,
    });
    const totals = active.reduce(
      (acc, a) => {
        acc.acquisitionValue += Number(a.acquisitionCost || 0);
        acc.currentValue += Number(this.currentValue(a) || 0);
        return acc;
      },
      { acquisitionValue: 0, currentValue: 0 },
    );

    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const [warrantyExpiring, inRepair, neverChecked] = await Promise.all([
      m.find(Asset, {
        where: { companyId, status: Not(AssetStatus.DISPOSED), warrantyEndDate: Between(today, in30) },
        order: { warrantyEndDate: 'ASC' },
        take: 50,
      }),
      m.find(Asset, { where: { companyId, status: AssetStatus.IN_REPAIR }, take: 50 }),
      m.count(Asset, {
        where: { companyId, status: Not(AssetStatus.DISPOSED), lastCheckedAt: IsNull() },
      }),
    ]);

    return {
      message: this.t('asset.dashboard', lang),
      data: {
        byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.count), units: Number(r.units) })),
        byCategory: byCategory.map((r) => ({ categoryId: r.categoryId, category: r.category ?? null, count: Number(r.count), value: Number(r.value) })),
        byBranch: byBranch.map((r) => ({ branchId: r.branchId, branch: r.branch ?? null, count: Number(r.count) })),
        totals: {
          assets: active.length,
          acquisitionValue: Math.round(totals.acquisitionValue * 100) / 100,
          currentValue: Math.round(totals.currentValue * 100) / 100,
        },
        warrantyExpiring,
        inRepair,
        neverChecked,
      },
    };
  }

  /** Utilisé par les admins de la plateforme pour vérifier l'accès (non exposé) */
  isAdmin(user: UserEntity) {
    return isPlatformAdmin(user);
  }
}
