import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, Brackets, DataSource, EntityManager, In, IsNull, Not } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { AssetAssignmentStatus, AssetCondition, AssetMovementType, AssetStatus } from '../common/logistics.enums';
import { isPlatformAdmin, pageParams, resolveCompanyId } from '../common/logistics-access';
import { LogisticsImageService } from '../common/logistics-image.service';
import { Asset } from './entities/asset.entity';
import { AssetCategory } from './entities/asset-category.entity';
import { AssetMovement } from './entities/asset-movement.entity';
import { AssetAssignment } from './entities/asset-assignment.entity';
import {
  AssetMovementQueryDto,
  AssetNoteDto,
  AssetQueryDto,
  AssignAssetDto,
  AssignmentQueryDto,
  BulkAssignDto,
  BulkReturnDto,
  CheckAssetDto,
  ConditionAssetDto,
  CreateAssetCategoryDto,
  CreateAssetDto,
  DisposeAssetDto,
  LostAssetDto,
  RepairAssetDto,
  ReturnAssetDto,
  StockInDto,
  TransferAssetDto,
  UpdateAssetCategoryDto,
  UpdateAssetDto,
} from './dto/asset.dto';

type File = Express.Multer.File | undefined;

/** Options d'une remise (sortie) */
export interface AssignOptions {
  requestId?: string | null;
  note?: string | null;
  photoUrl?: string | null;
  branchId?: string | null;
  location?: string | null;
}

/**
 * Logistique interne : biens de l'entreprise (patrimoine).
 * Entrées (création, réapprovisionnement), sorties partielles vers les employés (quantités),
 * restitutions, transfert entre branches, réparation, inventaire, sortie du patrimoine,
 * historique et image de chaque opération.
 */
@Injectable()
export class AssetService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly images: LogisticsImageService,
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
    return {
      ...asset,
      quantityAssigned: Math.max(0, Number(asset.quantity || 0) - Number(asset.quantityAvailable || 0)),
      currentValue: this.currentValue(asset),
    };
  }

  /** Image envoyée (multipart) ou URL fournie */
  private async photo(file: File, url?: string | null): Promise<string | null> {
    return (await this.images.upload(file)) ?? url ?? null;
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
  async checkEmployee(userId: string, companyId: string, lang: string): Promise<UserEntity> {
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

  async getAsset(id: string, user: UserEntity, lang: string, m?: EntityManager): Promise<Asset> {
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

  private async save(m: EntityManager, asset: Asset) {
    delete (asset as any).category;
    delete (asset as any).branch;
    delete (asset as any).assignedTo;
    await m.save(Asset, asset);
  }

  /**
   * Statut d'après les quantités : du stock → AVAILABLE ; tout est chez des employés → IN_USE.
   * Les statuts IN_REPAIR / LOST / DISPOSED restent tels quels.
   * Bien unitaire : assignedToUserId = l'employé qui l'a.
   */
  private async syncStatus(m: EntityManager, asset: Asset) {
    const active = await m.find(AssetAssignment, { where: { assetId: asset.id, status: AssetAssignmentStatus.ACTIVE }, order: { assignedAt: 'DESC' } });
    const out = active.reduce((s, a) => s + (a.quantity - a.returnedQuantity), 0);
    asset.quantityAvailable = Math.max(0, asset.quantity - out);
    if (![AssetStatus.IN_REPAIR, AssetStatus.LOST, AssetStatus.DISPOSED].includes(asset.status)) {
      asset.status = asset.quantityAvailable > 0 ? AssetStatus.AVAILABLE : out > 0 ? AssetStatus.IN_USE : AssetStatus.AVAILABLE;
    }
    const holders: string[] = [...new Set<string>(active.map((a) => a.userId))];
    // Un seul détenteur et plus rien en stock (ou bien unitaire) : il est « l'employé qui a le bien »
    asset.assignedToUserId = holders.length === 1 && (asset.quantity === 1 || asset.quantityAvailable === 0) ? holders[0] : null;
    asset.assignedAt = asset.assignedToUserId ? active[0]?.assignedAt ?? null : null;
  }

  // ============================================================
  // CATÉGORIES
  // ============================================================

  async createCategory(dto: CreateAssetCategoryDto, file: File, user: UserEntity, lang: string) {
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
        photoUrl: await this.photo(file, dto.photoUrl),
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
      .addSelect('COALESCE(SUM(a.quantity), 0)', 'units')
      .addSelect('COALESCE(SUM(a.quantityAvailable), 0)', 'available')
      .where('a.companyId = :companyId', { companyId })
      .andWhere('a.status != :disposed', { disposed: AssetStatus.DISPOSED })
      .groupBy('a.categoryId')
      .getRawMany();
    const byCat = new Map(counts.map((c) => [c.categoryId, c]));
    return {
      message: this.t('asset.categories', lang),
      data: rows.map((c: any) => {
        const r: any = byCat.get(c.id) || {};
        return { ...c, assetsCount: Number(r.count || 0), units: Number(r.units || 0), unitsAvailable: Number(r.available || 0) };
      }),
    };
  }

  async updateCategory(id: string, dto: UpdateAssetCategoryDto, file: File, user: UserEntity, lang: string) {
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
    const uploaded = await this.images.upload(file);
    if (uploaded) {
      await this.images.remove(cat.photoUrl);
      data.photoUrl = uploaded;
    }
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
    await this.images.remove(cat.photoUrl);
    return { message: this.t('asset.category_deleted', lang), data: { id } };
  }

  // ============================================================
  // BIENS — ENTRÉES
  // ============================================================

  /** Entrée dans le patrimoine (un bien ou un lot de N unités) */
  async create(dto: CreateAssetDto, file: File, user: UserEntity, lang: string) {
    const companyId = await this.company(user, dto.companyId, lang);
    const category = await this.checkCategory(dto.categoryId, companyId, lang);
    await this.checkBranch(dto.branchId, companyId, lang);
    if (dto.assignedToUserId) await this.checkEmployee(dto.assignedToUserId, companyId, lang);
    const photoUrl = await this.photo(file, dto.photoUrl);

    const asset = await this.dataSource.transaction(async (m) => {
      let reference = dto.reference?.trim();
      if (reference) {
        const dup = await m.count(Asset, { where: { companyId, reference } });
        if (dup) throw new ConflictException(this.t('asset.reference_exists', lang, { reference }));
      } else {
        reference = await this.nextReference(m, companyId, category?.code || 'AST');
      }
      const quantity = dto.quantity ?? 1;
      const { assignedToUserId, ...data } = dto;
      const saved = await m.save(
        Asset,
        m.create(Asset, {
          ...data,
          companyId,
          reference,
          quantity,
          quantityAvailable: quantity,
          unit: dto.unit?.trim() || 'pièce',
          condition: dto.condition ?? AssetCondition.NEW,
          currency: dto.currency || 'USD',
          status: AssetStatus.AVAILABLE,
          photoUrl,
          createdById: user?.id ?? null,
        }),
      );
      await this.log(m, saved, AssetMovementType.ACQUIRED, user, {
        toBranchId: saved.branchId ?? null,
        toStatus: AssetStatus.AVAILABLE,
        toCondition: saved.condition,
        location: saved.location ?? null,
        amount: saved.acquisitionCost ?? null,
        quantity,
        photoUrl,
        note: dto.supplier ? `Fournisseur : ${dto.supplier}` : null,
      });
      if (assignedToUserId) await this.assignInternal(m, saved, assignedToUserId, quantity, user, lang, {});
      return saved;
    });

    return { message: this.t('asset.created', lang, { reference: asset.reference }), data: await this.detailData(asset.id) };
  }

  /** ✅ Entrée de stock : N nouvelles unités d'un bien existant */
  async stockIn(id: string, dto: StockInDto, file: File, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    this.assertNotClosed(asset, lang);
    const photoUrl = await this.photo(file, dto.photoUrl);
    await this.dataSource.transaction(async (m) => {
      const before = asset.quantity;
      asset.quantity += dto.quantity;
      if (dto.unitCost !== undefined) {
        asset.acquisitionCost = Math.round((Number(asset.acquisitionCost || 0) + dto.unitCost * dto.quantity) * 100) / 100;
      }
      if (dto.supplier) asset.supplier = dto.supplier;
      if (dto.invoiceNumber) asset.invoiceNumber = dto.invoiceNumber;
      await this.syncStatus(m, asset);
      await this.save(m, asset);
      await this.log(m, asset, AssetMovementType.STOCK_IN, user, {
        quantity: dto.quantity,
        amount: dto.unitCost !== undefined ? Math.round(dto.unitCost * dto.quantity * 100) / 100 : null,
        toBranchId: asset.branchId ?? null,
        photoUrl,
        note: [`${before} → ${asset.quantity} ${asset.unit}`, dto.supplier ? `Fournisseur : ${dto.supplier}` : null, dto.invoiceNumber ? `Facture : ${dto.invoiceNumber}` : null, dto.note]
          .filter(Boolean)
          .join(' — ')
          .slice(0, 500),
      });
    });
    return { message: this.t('asset.stocked_in', lang, { quantity: dto.quantity }), data: await this.detailData(id) };
  }

  async update(id: string, dto: UpdateAssetDto, file: File, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    if (dto.categoryId !== undefined) await this.checkCategory(dto.categoryId, asset.companyId, lang);
    if (dto.reference && dto.reference.trim() !== asset.reference) {
      const dup = await this.dataSource.manager.count(Asset, {
        where: { companyId: asset.companyId, reference: dto.reference.trim(), id: Not(id) },
      });
      if (dup) throw new ConflictException(this.t('asset.reference_exists', lang, { reference: dto.reference }));
      dto.reference = dto.reference.trim();
    }
    const uploaded = await this.images.upload(file);
    await this.dataSource.transaction(async (m) => {
      Object.assign(asset, dto);
      if (uploaded) {
        await this.images.remove(asset.photoUrl);
        asset.photoUrl = uploaded;
      }
      await this.save(m, asset);
      await this.log(m, asset, AssetMovementType.UPDATED, user, {
        photoUrl: uploaded ?? null,
        note: [...Object.keys(dto), uploaded ? 'image' : null].filter(Boolean).join(', ').slice(0, 500),
      });
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
    const holders = await this.dataSource.manager.find(AssetAssignment, {
      where: { assetId: id, status: AssetAssignmentStatus.ACTIVE },
      relations: ['user'],
      order: { assignedAt: 'DESC' },
    });
    a.holders = holders.map((h) => ({
      assignmentId: h.id,
      quantity: h.quantity - h.returnedQuantity,
      assignedAt: h.assignedAt,
      requestId: h.requestId ?? null,
      photoUrl: h.photoUrl ?? null,
      user: h.user ? { id: h.user.id, fullName: h.user.fullName, phone: h.user.phone } : null,
    }));
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
    if (query.inStock === 'true') qb.andWhere('a.quantityAvailable > 0');
    if (query.branchId) qb.andWhere('a.branchId = :branchId', { branchId: query.branchId });
    if (query.categoryId) qb.andWhere('a.categoryId = :categoryId', { categoryId: query.categoryId });
    if (query.condition) qb.andWhere('a.condition = :condition', { condition: query.condition });
    if (query.assignedToUserId) {
      qb.andWhere(
        'a.id IN (SELECT `asg`.`assetId` FROM `bo_asset_assignments` `asg` WHERE `asg`.`userId` = :uid AND `asg`.`status` = :active)',
        { uid: query.assignedToUserId, active: AssetAssignmentStatus.ACTIVE },
      );
    }
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

  /** Biens (et quantités) détenus par un employé (« ses équipements ») */
  async byUser(userId: string, user: UserEntity, lang: string, companyIdParam?: string) {
    const companyId = await this.company(user, companyIdParam, lang);
    const rows = await this.dataSource.manager.find(AssetAssignment, {
      where: { companyId, userId, status: AssetAssignmentStatus.ACTIVE },
      relations: ['asset', 'asset.category', 'asset.branch'],
      order: { assignedAt: 'DESC' },
    });
    return {
      message: this.t('asset.user_assets', lang),
      data: rows.map((r) => ({
        assignmentId: r.id,
        quantity: r.quantity - r.returnedQuantity,
        assignedAt: r.assignedAt,
        requestId: r.requestId ?? null,
        photoUrl: r.photoUrl ?? null,
        asset: r.asset ? this.present(r.asset) : null,
      })),
    };
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
  // SORTIES (REMISES) ET RESTITUTIONS — QUANTITÉS
  // ============================================================

  /**
   * Remise de `quantity` unités à un employé, dans une transaction existante.
   * Utilisé par l'affectation simple, la sortie groupée et la sortie d'une demande de matériel.
   */
  async assignInternal(
    m: EntityManager,
    asset: Asset,
    userId: string,
    quantity: number | undefined,
    actor: UserEntity | null,
    lang: string,
    opts: AssignOptions,
  ): Promise<AssetAssignment> {
    this.assertNotClosed(asset, lang);
    if ([AssetStatus.IN_REPAIR, AssetStatus.LOST].includes(asset.status)) {
      throw new BadRequestException(this.t('asset.not_available', lang, { status: asset.status }));
    }
    await this.syncStatus(m, asset);
    const qty = quantity ?? asset.quantityAvailable;
    if (qty < 1 || qty > asset.quantityAvailable) {
      throw new BadRequestException(
        this.t('asset.not_enough_stock', lang, { name: asset.name, available: asset.quantityAvailable, unit: asset.unit, requested: qty }),
      );
    }
    let assignment = await m.findOne(AssetAssignment, {
      where: { assetId: asset.id, userId, status: AssetAssignmentStatus.ACTIVE, requestId: opts.requestId ? opts.requestId : IsNull() },
    });
    if (assignment) {
      assignment.quantity += qty;
      if (opts.photoUrl) assignment.photoUrl = opts.photoUrl;
      assignment = await m.save(AssetAssignment, assignment);
    } else {
      assignment = await m.save(
        AssetAssignment,
        m.create(AssetAssignment, {
          companyId: asset.companyId,
          assetId: asset.id,
          userId,
          quantity: qty,
          returnedQuantity: 0,
          status: AssetAssignmentStatus.ACTIVE,
          requestId: opts.requestId ?? null,
          assignedAt: new Date(),
          assignedById: actor?.id ?? null,
          note: opts.note ?? null,
          photoUrl: opts.photoUrl ?? null,
        }),
      );
    }
    const fromStatus = asset.status;
    const fromBranch = asset.branchId ?? null;
    if (opts.branchId) asset.branchId = opts.branchId;
    if (opts.location) asset.location = opts.location;
    await this.syncStatus(m, asset);
    await this.save(m, asset);
    await this.log(m, asset, AssetMovementType.ASSIGNED, actor, {
      toUserId: userId,
      fromBranchId: fromBranch,
      toBranchId: asset.branchId ?? null,
      fromStatus,
      toStatus: asset.status,
      location: asset.location ?? null,
      quantity: qty,
      photoUrl: opts.photoUrl ?? null,
      assignmentId: assignment.id,
      requestId: opts.requestId ?? null,
      note: opts.note ?? null,
    });
    return assignment;
  }

  /** Restitution de `quantity` unités d'une remise */
  private async returnInternal(
    m: EntityManager,
    asset: Asset,
    assignment: AssetAssignment,
    quantity: number | undefined,
    actor: UserEntity | null,
    lang: string,
    opts: { condition?: AssetCondition; branchId?: string | null; location?: string | null; note?: string | null; photoUrl?: string | null },
  ) {
    const held = assignment.quantity - assignment.returnedQuantity;
    const qty = quantity ?? held;
    if (qty < 1 || qty > held) throw new BadRequestException(this.t('asset.return_too_much', lang, { held, unit: asset.unit }));
    assignment.returnedQuantity += qty;
    if (assignment.returnedQuantity >= assignment.quantity) {
      assignment.status = AssetAssignmentStatus.RETURNED;
      assignment.returnedAt = new Date();
    }
    await m.save(AssetAssignment, assignment);
    const fromStatus = asset.status;
    const fromCondition = asset.condition;
    if (opts.branchId) asset.branchId = opts.branchId;
    if (opts.location) asset.location = opts.location;
    if (opts.condition) asset.condition = opts.condition;
    await this.syncStatus(m, asset);
    await this.save(m, asset);
    await this.log(m, asset, AssetMovementType.RETURNED, actor, {
      fromUserId: assignment.userId,
      fromStatus,
      toStatus: asset.status,
      toBranchId: asset.branchId ?? null,
      fromCondition,
      toCondition: asset.condition,
      location: asset.location ?? null,
      quantity: qty,
      photoUrl: opts.photoUrl ?? null,
      assignmentId: assignment.id,
      requestId: assignment.requestId ?? null,
      note: opts.note ?? null,
    });
  }

  async assign(id: string, dto: AssignAssetDto, file: File, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    await this.checkEmployee(dto.userId, asset.companyId, lang);
    const branch = await this.checkBranch(dto.branchId, asset.companyId, lang);
    const photoUrl = await this.photo(file, dto.photoUrl);
    await this.dataSource.transaction((m) =>
      this.assignInternal(m, asset, dto.userId, dto.quantity, user, lang, {
        branchId: branch?.id ?? null,
        location: dto.location ?? null,
        note: dto.note ?? null,
        photoUrl,
      }),
    );
    return { message: this.t('asset.assigned', lang), data: await this.detailData(id) };
  }

  async returnAsset(id: string, dto: ReturnAssetDto, file: File, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    const branch = await this.checkBranch(dto.branchId, asset.companyId, lang);
    const photoUrl = await this.photo(file, dto.photoUrl);
    await this.dataSource.transaction(async (m) => {
      const where: any = { assetId: id, status: AssetAssignmentStatus.ACTIVE };
      if (dto.assignmentId) where.id = dto.assignmentId;
      if (dto.userId) where.userId = dto.userId;
      const active = await m.find(AssetAssignment, { where, order: { assignedAt: 'ASC' } });
      if (!active.length) throw new BadRequestException(this.t('asset.not_assigned', lang));
      if (active.length > 1 && !dto.userId && !dto.assignmentId) {
        throw new BadRequestException(this.t('asset.return_which_user', lang));
      }
      let remaining = dto.quantity;
      for (const a of active) {
        const held = a.quantity - a.returnedQuantity;
        const qty = remaining === undefined ? held : Math.min(held, remaining);
        if (qty <= 0) break;
        await this.returnInternal(m, asset, a, qty, user, lang, {
          condition: dto.condition,
          branchId: branch?.id ?? null,
          location: dto.location ?? null,
          note: dto.note ?? null,
          photoUrl,
        });
        if (remaining !== undefined) remaining -= qty;
      }
      if (remaining !== undefined && remaining > 0) {
        throw new BadRequestException(this.t('asset.return_too_much', lang, { held: dto.quantity! - remaining, unit: asset.unit }));
      }
    });
    return { message: this.t('asset.returned', lang), data: await this.detailData(id) };
  }

  /** ✅ Sortie groupée : un employé reçoit plusieurs biens (quantités) en une fois → bon de sortie */
  async bulkAssign(dto: BulkAssignDto, file: File, user: UserEntity, lang: string) {
    const first = await this.getAsset(dto.lines[0].assetId, user, lang);
    const companyId = first.companyId;
    await this.checkEmployee(dto.userId, companyId, lang);
    const photoUrl = await this.photo(file, dto.photoUrl);
    const ids: string[] = [...new Set<string>(dto.lines.map((l) => l.assetId))];
    if (ids.length !== dto.lines.length) throw new BadRequestException(this.t('asset.duplicate_lines', lang));
    const assignments = await this.dataSource.transaction(async (m) => {
      const assets = await m.find(Asset, { where: { id: In(ids) } });
      if (assets.length !== ids.length || assets.some((a) => a.companyId !== companyId)) throw new NotFoundException(this.t('asset.not_found', lang));
      const out: AssetAssignment[] = [];
      for (const line of dto.lines) {
        const asset = assets.find((a) => a.id === line.assetId)!;
        out.push(await this.assignInternal(m, asset, dto.userId, line.quantity, user, lang, { note: dto.note ?? null, photoUrl }));
      }
      return out;
    });
    return {
      message: this.t('asset.bulk_assigned', lang, { count: assignments.length }),
      data: await this.deliveryNote(assignments.map((a) => a.id), companyId, user, lang),
    };
  }

  /** ✅ Restitution groupée */
  async bulkReturn(dto: BulkReturnDto, file: File, user: UserEntity, lang: string) {
    const ids: string[] = [...new Set<string>(dto.lines.map((l) => l.assignmentId))];
    const rows = await this.dataSource.manager.find(AssetAssignment, { where: { id: In(ids) } });
    if (rows.length !== ids.length) throw new NotFoundException(this.t('asset.assignment_not_found', lang));
    const companyId = rows[0].companyId;
    if (rows.some((r) => r.companyId !== companyId)) throw new BadRequestException(this.t('asset.forbidden', lang));
    await this.company(user, companyId, lang);
    const branch = await this.checkBranch(dto.branchId, companyId, lang);
    const photoUrl = await this.photo(file, dto.photoUrl);
    await this.dataSource.transaction(async (m) => {
      for (const line of dto.lines) {
        const a = await m.findOne(AssetAssignment, { where: { id: line.assignmentId } });
        if (!a || a.status !== AssetAssignmentStatus.ACTIVE) throw new BadRequestException(this.t('asset.not_assigned', lang));
        const asset = await m.findOne(Asset, { where: { id: a.assetId } });
        if (!asset) throw new NotFoundException(this.t('asset.not_found', lang));
        await this.returnInternal(m, asset, a, line.quantity, user, lang, {
          condition: line.condition,
          branchId: branch?.id ?? null,
          note: dto.note ?? null,
          photoUrl,
        });
      }
    });
    return { message: this.t('asset.bulk_returned', lang, { count: dto.lines.length }), data: { assignmentIds: ids } };
  }

  /** Remises (en cours ou passées) */
  async assignments(query: AssignmentQueryDto, user: UserEntity, lang: string) {
    const companyId = await this.company(user, query.companyId, lang);
    const { page, limit, skip } = pageParams(query.page, query.limit);
    const qb = this.dataSource.manager
      .createQueryBuilder(AssetAssignment, 'g')
      .leftJoin('g.asset', 'asset')
      .addSelect(['asset.id', 'asset.reference', 'asset.name', 'asset.unit', 'asset.photoUrl'])
      .leftJoin('g.user', 'u')
      .addSelect(['u.id', 'u.fullName', 'u.phone'])
      .where('g.companyId = :companyId', { companyId });
    if (query.userId) qb.andWhere('g.userId = :userId', { userId: query.userId });
    if (query.assetId) qb.andWhere('g.assetId = :assetId', { assetId: query.assetId });
    if (query.active === 'true') qb.andWhere('g.status = :s', { s: AssetAssignmentStatus.ACTIVE });
    const [items, total] = await qb.orderBy('g.assignedAt', 'DESC').skip(skip).take(limit).getManyAndCount();
    return {
      message: this.t('asset.assignments', lang),
      data: new PaginatedResponseDto(items.map((g) => ({ ...g, quantityHeld: g.quantity - g.returnedQuantity })) as any, total, page, limit),
    };
  }

  /** ✅ Bon de sortie (données à imprimer) pour une ou plusieurs remises */
  async deliveryNote(assignmentIds: string[], companyId: string, user: UserEntity, lang: string) {
    await this.company(user, companyId, lang);
    const rows = await this.dataSource.manager.find(AssetAssignment, {
      where: { id: In(assignmentIds), companyId },
      relations: ['asset', 'user'],
      order: { assignedAt: 'ASC' },
    });
    if (!rows.length) throw new NotFoundException(this.t('asset.assignment_not_found', lang));
    const company = await this.dataSource.query('SELECT `id`, `companyName`, `logo`, `phone`, `address` FROM `company` WHERE `id` = ? LIMIT 1', [companyId]);
    const issuer = rows[0].assignedById ? await this.dataSource.manager.findOne(UserEntity, { where: { id: rows[0].assignedById } }) : null;
    const d = rows[0].assignedAt ? new Date(rows[0].assignedAt) : new Date();
    const number = `BS-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${rows[0].id.slice(0, 6).toUpperCase()}`;
    return {
      number,
      date: d,
      company: company?.[0] ?? null,
      recipient: rows[0].user ? { id: rows[0].user.id, fullName: rows[0].user.fullName, phone: rows[0].user.phone, email: rows[0].user.email } : null,
      issuedBy: issuer ? { id: issuer.id, fullName: issuer.fullName } : null,
      requestId: rows[0].requestId ?? null,
      lines: rows.map((r) => ({
        assignmentId: r.id,
        reference: r.asset?.reference,
        name: r.asset?.name,
        quantity: r.quantity - r.returnedQuantity,
        unit: r.asset?.unit,
        condition: r.asset?.condition,
        photoUrl: r.asset?.photoUrl ?? null,
      })),
      photoUrl: rows[0].photoUrl ?? null,
    };
  }

  async deliveryNoteFor(assignmentId: string, user: UserEntity, lang: string) {
    const a = await this.dataSource.manager.findOne(AssetAssignment, { where: { id: assignmentId } });
    if (!a) throw new NotFoundException(this.t('asset.assignment_not_found', lang));
    // Toutes les remises faites au même moment au même employé (sortie groupée)
    const siblings = await this.dataSource.manager.find(AssetAssignment, {
      where: { companyId: a.companyId, userId: a.userId, assignedAt: Between(new Date(new Date(a.assignedAt).getTime() - 5000), new Date(new Date(a.assignedAt).getTime() + 5000)) },
    });
    return { message: this.t('asset.delivery_note', lang), data: await this.deliveryNote(siblings.map((s) => s.id), a.companyId, user, lang) };
  }

  // ============================================================
  // AUTRES ACTIONS
  // ============================================================

  async transfer(id: string, dto: TransferAssetDto, file: File, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    this.assertNotClosed(asset, lang);
    const branch = await this.checkBranch(dto.toBranchId, asset.companyId, lang);
    if (asset.branchId === dto.toBranchId && (!dto.location || dto.location === asset.location)) {
      throw new BadRequestException(this.t('asset.same_branch', lang));
    }
    const photoUrl = await this.photo(file, dto.photoUrl);
    await this.dataSource.transaction(async (m) => {
      const fromBranch = asset.branchId ?? null;
      const fromLocation = asset.location ?? null;
      asset.branchId = branch!.id;
      asset.location = dto.location ?? null;
      await this.save(m, asset);
      await this.log(m, asset, AssetMovementType.TRANSFERRED, user, {
        fromBranchId: fromBranch,
        toBranchId: asset.branchId,
        location: asset.location ?? null,
        quantity: asset.quantity,
        photoUrl,
        note: [dto.note, fromLocation ? `Ancien emplacement : ${fromLocation}` : null].filter(Boolean).join(' — ') || null,
      });
    });
    return { message: this.t('asset.transferred', lang, { branch: branch!.name }), data: await this.detailData(id) };
  }

  async repair(id: string, dto: RepairAssetDto, file: File, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    this.assertNotClosed(asset, lang);
    if (dto.action === 'SEND' && asset.status === AssetStatus.IN_REPAIR) {
      throw new BadRequestException(this.t('asset.already_in_repair', lang));
    }
    if (dto.action === 'RETURN' && asset.status !== AssetStatus.IN_REPAIR) {
      throw new BadRequestException(this.t('asset.not_in_repair', lang));
    }
    const photoUrl = await this.photo(file, dto.photoUrl);
    await this.dataSource.transaction(async (m) => {
      const fromStatus = asset.status;
      const fromCondition = asset.condition;
      if (dto.action === 'SEND') {
        asset.status = AssetStatus.IN_REPAIR;
      } else {
        // Retour : la situation est recalculée d'après les quantités remises
        asset.status = AssetStatus.AVAILABLE;
        await this.syncStatus(m, asset);
      }
      if (dto.condition) asset.condition = dto.condition;
      await this.save(m, asset);
      await this.log(m, asset, dto.action === 'SEND' ? AssetMovementType.REPAIR_SENT : AssetMovementType.REPAIR_RETURNED, user, {
        fromStatus,
        toStatus: asset.status,
        fromCondition,
        toCondition: asset.condition,
        amount: dto.cost ?? null,
        photoUrl,
        note: dto.note ?? null,
      });
    });
    return {
      message: this.t(dto.action === 'SEND' ? 'asset.repair_sent' : 'asset.repair_returned', lang),
      data: await this.detailData(id),
    };
  }

  async changeCondition(id: string, dto: ConditionAssetDto, file: File, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    this.assertNotClosed(asset, lang);
    const photoUrl = await this.photo(file, dto.photoUrl);
    if (asset.condition === dto.condition && !photoUrl) return { message: this.t('asset.condition_changed', lang), data: await this.detailData(id) };
    await this.dataSource.transaction(async (m) => {
      const from = asset.condition;
      asset.condition = dto.condition;
      await this.save(m, asset);
      await this.log(m, asset, AssetMovementType.CONDITION_CHANGED, user, {
        fromCondition: from,
        toCondition: dto.condition,
        photoUrl,
        note: dto.note ?? null,
      });
    });
    return { message: this.t('asset.condition_changed', lang), data: await this.detailData(id) };
  }

  /** Contrôle d'inventaire : le bien a été vu (état, emplacement, quantité comptée) */
  async check(id: string, dto: CheckAssetDto, file: File, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    this.assertNotClosed(asset, lang);
    const photoUrl = await this.photo(file, dto.photoUrl);
    await this.dataSource.transaction(async (m) => {
      const fromCondition = asset.condition;
      const fromStatus = asset.status;
      asset.lastCheckedAt = new Date();
      if (dto.condition) asset.condition = dto.condition;
      if (dto.location) asset.location = dto.location;
      if (asset.status === AssetStatus.LOST) {
        asset.status = AssetStatus.AVAILABLE;
        await this.syncStatus(m, asset);
      }
      const diff = dto.countedQuantity !== undefined && dto.countedQuantity !== asset.quantityAvailable
        ? ` — en stock compté ${dto.countedQuantity} / attendu ${asset.quantityAvailable} ${asset.unit}`
        : '';
      await this.save(m, asset);
      await this.log(m, asset, AssetMovementType.INVENTORY_CHECK, user, {
        fromStatus,
        toStatus: asset.status,
        fromCondition,
        toCondition: asset.condition,
        location: asset.location ?? null,
        quantity: dto.countedQuantity ?? null,
        photoUrl,
        note: `${dto.note ?? ''}${diff}`.trim() || null,
      });
    });
    return { message: this.t('asset.checked', lang), data: await this.detailData(id) };
  }

  /**
   * Perte : une partie du stock (quantity < unités en stock → le lot diminue)
   * ou tout le bien (statut LOST).
   */
  async markLost(id: string, dto: LostAssetDto, file: File, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    this.assertNotClosed(asset, lang);
    if (asset.status === AssetStatus.LOST) throw new BadRequestException(this.t('asset.already_lost', lang));
    const photoUrl = await this.photo(file, dto.photoUrl);
    await this.dataSource.transaction(async (m) => {
      await this.syncStatus(m, asset);
      const partial = dto.quantity !== undefined && dto.quantity < asset.quantity;
      if (partial) {
        if (dto.quantity! > asset.quantityAvailable) {
          throw new BadRequestException(this.t('asset.not_enough_stock', lang, { name: asset.name, available: asset.quantityAvailable, unit: asset.unit, requested: dto.quantity }));
        }
        asset.quantity -= dto.quantity!;
        await this.syncStatus(m, asset);
        await this.save(m, asset);
        await this.log(m, asset, AssetMovementType.LOST, user, { quantity: dto.quantity!, photoUrl, note: dto.note ?? null });
        return;
      }
      const from = asset.status;
      asset.status = AssetStatus.LOST;
      await this.save(m, asset);
      await this.log(m, asset, AssetMovementType.LOST, user, {
        fromStatus: from,
        toStatus: AssetStatus.LOST,
        fromUserId: asset.assignedToUserId ?? null,
        quantity: asset.quantity,
        photoUrl,
        note: dto.note ?? null,
      });
    });
    return { message: this.t('asset.lost', lang), data: await this.detailData(id) };
  }

  async markFound(id: string, dto: AssetNoteDto, file: File, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    if (asset.status !== AssetStatus.LOST) throw new BadRequestException(this.t('asset.not_lost', lang));
    const photoUrl = await this.photo(file, dto.photoUrl);
    await this.dataSource.transaction(async (m) => {
      asset.status = AssetStatus.AVAILABLE;
      await this.syncStatus(m, asset);
      await this.save(m, asset);
      await this.log(m, asset, AssetMovementType.FOUND, user, {
        fromStatus: AssetStatus.LOST,
        toStatus: asset.status,
        photoUrl,
        note: dto.note ?? null,
      });
    });
    return { message: this.t('asset.found', lang), data: await this.detailData(id) };
  }

  /**
   * Sortie du patrimoine (vendu, donné, détruit, volé).
   * quantity < total → seules ces unités (en stock) sortent ; sinon tout le bien (les remises en cours sont clôturées).
   */
  async dispose(id: string, dto: DisposeAssetDto, file: File, user: UserEntity, lang: string) {
    const asset = await this.getAsset(id, user, lang);
    this.assertNotClosed(asset, lang);
    const photoUrl = await this.photo(file, dto.photoUrl);
    await this.dataSource.transaction(async (m) => {
      await this.syncStatus(m, asset);
      const partial = dto.quantity !== undefined && dto.quantity < asset.quantity;
      if (partial) {
        if (dto.quantity! > asset.quantityAvailable) {
          throw new BadRequestException(this.t('asset.not_enough_stock', lang, { name: asset.name, available: asset.quantityAvailable, unit: asset.unit, requested: dto.quantity }));
        }
        asset.quantity -= dto.quantity!;
        await this.syncStatus(m, asset);
        await this.save(m, asset);
        await this.log(m, asset, AssetMovementType.DISPOSED, user, {
          quantity: dto.quantity!,
          amount: dto.disposalValue ?? null,
          photoUrl,
          note: [dto.reason, dto.note].filter(Boolean).join(' — '),
        });
        return;
      }
      const from = asset.status;
      const fromUser = asset.assignedToUserId ?? null;
      await m.update(
        AssetAssignment,
        { assetId: id, status: AssetAssignmentStatus.ACTIVE },
        { status: AssetAssignmentStatus.RETURNED, returnedAt: new Date(), note: 'Clôturée : bien sorti du patrimoine' },
      );
      asset.status = AssetStatus.DISPOSED;
      asset.disposalReason = dto.reason;
      asset.disposalDate = dto.disposalDate ?? new Date().toISOString().slice(0, 10);
      asset.disposalValue = dto.disposalValue ?? null;
      asset.assignedToUserId = null;
      asset.assignedAt = null;
      asset.quantityAvailable = 0;
      await this.save(m, asset);
      await this.log(m, asset, AssetMovementType.DISPOSED, user, {
        fromStatus: from,
        toStatus: AssetStatus.DISPOSED,
        fromUserId: fromUser,
        amount: dto.disposalValue ?? null,
        quantity: asset.quantity,
        photoUrl,
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
      .addSelect(['asset.id', 'asset.reference', 'asset.name', 'asset.unit', 'asset.photoUrl'])
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
      .addSelect('COALESCE(SUM(a.quantityAvailable), 0)', 'available')
      .where('a.companyId = :companyId', { companyId })
      .groupBy('a.status')
      .getRawMany();

    const byCategory = await m
      .createQueryBuilder(Asset, 'a')
      .leftJoin('a.category', 'c')
      .select('c.id', 'categoryId')
      .addSelect('c.name', 'category')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(a.quantity), 0)', 'units')
      .addSelect('COALESCE(SUM(a.quantityAvailable), 0)', 'available')
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
    const [warrantyExpiring, inRepair, neverChecked, outOfStock, activeAssignments, pendingRequests] = await Promise.all([
      m.find(Asset, {
        where: { companyId, status: Not(AssetStatus.DISPOSED), warrantyEndDate: Between(today, in30) },
        order: { warrantyEndDate: 'ASC' },
        take: 50,
      }),
      m.find(Asset, { where: { companyId, status: AssetStatus.IN_REPAIR }, take: 50 }),
      m.count(Asset, {
        where: { companyId, status: Not(AssetStatus.DISPOSED), lastCheckedAt: IsNull() },
      }),
      m.count(Asset, { where: { companyId, status: Not(AssetStatus.DISPOSED), quantityAvailable: 0 } }),
      m.count(AssetAssignment, { where: { companyId, status: AssetAssignmentStatus.ACTIVE } }),
      this.dataSource
        .query("SELECT COUNT(*) AS n FROM `bo_material_requests` WHERE `companyId` = ? AND `status` IN ('PENDING','APPROVED','PARTIALLY_ISSUED')", [companyId])
        .then((r: any[]) => Number(r?.[0]?.n || 0))
        .catch(() => 0),
    ]);

    return {
      message: this.t('asset.dashboard', lang),
      data: {
        byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.count), units: Number(r.units), available: Number(r.available) })),
        byCategory: byCategory.map((r) => ({
          categoryId: r.categoryId,
          category: r.category ?? null,
          count: Number(r.count),
          units: Number(r.units),
          available: Number(r.available),
          value: Number(r.value),
        })),
        byBranch: byBranch.map((r) => ({ branchId: r.branchId, branch: r.branch ?? null, count: Number(r.count) })),
        totals: {
          assets: active.length,
          acquisitionValue: Math.round(totals.acquisitionValue * 100) / 100,
          currentValue: Math.round(totals.currentValue * 100) / 100,
        },
        outOfStock,
        activeAssignments,
        pendingRequests,
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
