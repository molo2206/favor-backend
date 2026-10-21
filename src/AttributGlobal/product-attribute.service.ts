import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Not } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { Product } from 'src/products/entities/product.entity';
import { ImageProductEntity } from 'src/products/entities/imageProduct.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { CategoryEntity } from 'src/category/entities/category.entity';
import {
  OrderItemAttributeSnapshot,
  OrderItemEntity,
} from 'src/order-item/entities/order-item.entity';
import { SubOrderItemEntity } from 'src/sub-order-item/entities/sub-order-item.entity';
import { slugify } from 'src/users/utility/slug/slugify';
import { Attribute } from './entities/attributes.entity';
import { AttributeValue } from './entities/attribute_values.entity';
import { ProductAttribute } from './entities/product_attributes.entity';
import { ProductAttributeValue } from './entities/product_attribute_values.entity';
import { ProductVariation } from './entities/product_variations.entity';
import { VariationAttributeValue } from './entities/variation_attribute_values.entity';
import { CategoryAttribute } from './entities/category_attributes.entity';
import { OrderItemAttribute } from './entities/order_item_attributes.entity';
import { ATTRIBUTE_TYPES_WITH_VALUES, AttributeType } from './enum/attributeType.enum';
import {
  CategoryAttributeInputDto,
  GenerateVariationsDto,
  ProductAttributeInputDto,
  ProductAttributeValueInputDto,
  ProductVariationInputDto,
  VariationAttributeValueInputDto,
} from './dto/product-attribute.dto';

/** Choix du client pour une ligne de commande */
export interface OrderItemSelectionInput {
  productId: string;
  quantity: number;
  variationId?: string | null;
  attributes?: { attributeId: string; attributeValueId?: string | null; value?: string | null }[] | null;
}

/** Résultat prêt à être enregistré sur order_items / sub_order_items */
export interface OrderItemSelection {
  variation: ProductVariation | null;
  variationId: string | null;
  sku: string | null;
  variationLabel: string | null;
  attributesSnapshot: OrderItemAttributeSnapshot[] | null;
  priceAdjustment: number;
}

const MAX_GENERATED_VARIATIONS = 200;

@Injectable()
export class ProductAttributeService {
  private readonly logger = new Logger(ProductAttributeService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
  ) { }

  // ============================================================
  // OUTILS
  // ============================================================

  private t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params);
  }

  private hasValueList(type: AttributeType | string | null | undefined): boolean {
    return ATTRIBUTE_TYPES_WITH_VALUES.includes(type as AttributeType);
  }

  private toBool(value: unknown): boolean | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const v = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'oui', 'on'].includes(v)) return true;
    if (['false', '0', 'no', 'non', 'off'].includes(v)) return false;
    return undefined;
  }

  private toNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }

  private parseJsonInput(input: unknown, errorKey: string, lang: string): unknown {
    if (typeof input !== 'string') return input;
    const trimmed = input.trim();
    if (!trimmed) return undefined;
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new BadRequestException(this.t(errorKey, lang));
    }
  }

  /** Vérifie et normalise une valeur libre selon le type de l'attribut */
  private normalizeFreeValue(attribute: Attribute, raw: unknown, lang: string): string {
    const value = raw === undefined || raw === null ? '' : String(raw).trim();
    if (!value) {
      throw new BadRequestException(this.t('attribute.value_required', lang, { name: attribute.name }));
    }
    if (attribute.type === AttributeType.NUMBER) {
      const n = this.toNumber(value);
      if (n === undefined) {
        throw new BadRequestException(this.t('attribute.invalid_number', lang, { name: attribute.name }));
      }
      return String(n);
    }
    if (attribute.type === AttributeType.BOOLEAN) {
      const b = this.toBool(value);
      if (b === undefined) {
        throw new BadRequestException(this.t('attribute.invalid_boolean', lang, { name: attribute.name }));
      }
      return b ? 'true' : 'false';
    }
    return value.slice(0, 255);
  }

  private valueLabel(av: { displayName?: string | null; value: string }): string {
    return (av.displayName && av.displayName.trim()) || av.value;
  }

  private buildVariationName(parts: { position: number; label: string }[]): string | null {
    if (!parts.length) return null;
    return parts
      .sort((a, b) => a.position - b.position)
      .map((p) => p.label)
      .join(' / ')
      .slice(0, 255);
  }

  private buildSelectionLabel(snapshot: OrderItemAttributeSnapshot[]): string | null {
    if (!snapshot.length) return null;
    return snapshot
      .map((s) => `${s.name} : ${(s.displayName && s.displayName.trim()) || s.value}`)
      .join(', ')
      .slice(0, 500);
  }

  // ============================================================
  // DROITS
  // ============================================================

  /** Admin / super admin, ou utilisateur rattaché à l'entreprise du produit */
  async assertCanManageProduct(user: UserEntity, productId: string, lang: string): Promise<Product> {
    const product = await this.dataSource.getRepository(Product).findOne({
      where: { id: productId },
      relations: ['company'],
    });
    if (!product) {
      throw new NotFoundException(this.t('attribute.product_not_found', lang));
    }
    if (!user) {
      throw new ForbiddenException(this.t('attribute.forbidden', lang));
    }
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) return product;

    const companyId = product.company?.id;
    if (companyId) {
      const rows = await this.dataSource.query(
        'SELECT 1 FROM `user_has_company` WHERE `userId` = ? AND `companyId` = ? LIMIT 1',
        [user.id, companyId],
      );
      if (Array.isArray(rows) && rows.length > 0) return product;
    }
    throw new ForbiddenException(this.t('attribute.forbidden', lang));
  }

  // ============================================================
  // VALEURS D'ATTRIBUT
  // ============================================================

  /**
   * Retrouve une valeur d'attribut par id ou par texte.
   * createIfMissing = true → crée la valeur si le texte n'existe pas encore.
   */
  async resolveAttributeValue(
    manager: EntityManager,
    attribute: Attribute,
    input: { attributeValueId?: string | null; value?: string | null; displayName?: string; color?: string; imageUrl?: string },
    lang: string,
    createIfMissing: boolean,
  ): Promise<AttributeValue> {
    if (input.attributeValueId) {
      const found = await manager.findOne(AttributeValue, {
        where: { id: input.attributeValueId, attributeId: attribute.id },
      });
      if (!found) {
        throw new NotFoundException(
          this.t('attribute.value_not_found', lang, { id: input.attributeValueId, name: attribute.name }),
        );
      }
      return found;
    }

    const text = input.value === undefined || input.value === null ? '' : String(input.value).trim();
    if (!text) {
      throw new BadRequestException(this.t('attribute.value_required', lang, { name: attribute.name }));
    }

    const existing = await manager.findOne(AttributeValue, {
      where: { attributeId: attribute.id, value: text },
    });
    if (existing) return existing;

    if (!createIfMissing) {
      throw new NotFoundException(this.t('attribute.value_not_found', lang, { id: text, name: attribute.name }));
    }

    const maxRow = await manager
      .createQueryBuilder(AttributeValue, 'v')
      .select('MAX(v.position)', 'max')
      .where('v.attributeId = :id', { id: attribute.id })
      .getRawOne<{ max: number | null }>();

    const created = manager.create(AttributeValue, {
      attributeId: attribute.id,
      attribute: { id: attribute.id } as Attribute,
      value: text.slice(0, 255),
      displayName: input.displayName ?? text.slice(0, 255),
      color: input.color ?? (attribute.type === AttributeType.COLOR && /^#?[0-9a-f]{3,8}$/i.test(text) ? text : undefined),
      imageUrl: input.imageUrl,
      position: Number(maxRow?.max ?? -1) + 1,
      isActive: true,
    });
    return manager.save(AttributeValue, created);
  }

  // ============================================================
  // PRODUIT ↔ ATTRIBUTS
  // ============================================================

  /**
   * Accepte l'ancien format (["uuid", "uuid"]) et le nouveau format
   * ([{ attributeId, isRequired, values: [...] }]). Une chaîne JSON est aussi acceptée.
   * undefined → rien à faire ; null → liste vide.
   */
  normalizeAttributeInputs(input: unknown, lang: string): ProductAttributeInputDto[] | undefined {
    const parsed = this.parseJsonInput(input, 'attribute.invalid_payload', lang);
    if (parsed === undefined) return undefined;
    if (parsed === null) return [];
    if (!Array.isArray(parsed)) {
      throw new BadRequestException(this.t('attribute.invalid_payload', lang));
    }

    const byId = new Map<string, ProductAttributeInputDto>();
    for (const raw of parsed) {
      let item: ProductAttributeInputDto;
      if (typeof raw === 'string') {
        item = { attributeId: raw.trim() };
      } else if (raw && typeof raw === 'object') {
        const r = raw as Record<string, any>;
        const attributeId = String(r.attributeId ?? r.id ?? '').trim();
        item = {
          attributeId,
          isRequired: this.toBool(r.isRequired),
          isVariant: this.toBool(r.isVariant),
          isVisible: this.toBool(r.isVisible),
          position: this.toNumber(r.position),
          customValue: r.customValue === undefined ? undefined : r.customValue === null ? null : String(r.customValue),
          values: Array.isArray(r.values) ? (r.values as ProductAttributeValueInputDto[]) : undefined,
        };
      } else {
        throw new BadRequestException(this.t('attribute.invalid_payload', lang));
      }
      if (!item.attributeId) {
        throw new BadRequestException(this.t('attribute.invalid_payload', lang));
      }
      byId.set(item.attributeId, item);
    }
    return Array.from(byId.values());
  }

  /**
   * Crée / met à jour les liens produit ↔ attributs (+ valeurs autorisées).
   * replace = true → les attributs absents de la liste sont retirés du produit.
   */
  async syncProductAttributes(
    manager: EntityManager,
    productId: string,
    input: unknown,
    lang: string,
    options: { replace?: boolean } = {},
  ): Promise<void> {
    const items = this.normalizeAttributeInputs(input, lang);
    if (items === undefined) return;
    const replace = options.replace !== false;

    const attributeIds = items.map((i) => i.attributeId);
    const attributes = attributeIds.length
      ? await manager.find(Attribute, { where: { id: In(attributeIds) } })
      : [];
    const attributeMap = new Map<string, Attribute>(attributes.map((a: Attribute) => [a.id, a] as [string, Attribute]));
    for (const id of attributeIds) {
      if (!attributeMap.has(id)) {
        throw new NotFoundException(this.t('attribute.not_found', lang, { id }));
      }
    }

    const existing = await manager.find(ProductAttribute, { where: { productId } });
    const existingMap = new Map<string, ProductAttribute>(existing.map((pa: ProductAttribute) => [pa.attributeId, pa] as [string, ProductAttribute]));

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const attribute = attributeMap.get(item.attributeId)!;
      let pa = existingMap.get(item.attributeId);
      const isNew = !pa;

      if (!pa) {
        pa = manager.create(ProductAttribute, {
          productId,
          attributeId: attribute.id,
          product: { id: productId } as Product,
          attribute: { id: attribute.id } as Attribute,
        }) as ProductAttribute;
      }

      pa.isRequired = item.isRequired ?? (isNew ? !!attribute.isRequired : pa.isRequired);
      pa.isVariant = item.isVariant ?? (isNew ? attribute.isVariant !== false && this.hasValueList(attribute.type) : pa.isVariant);
      pa.isVisible = item.isVisible ?? (isNew ? attribute.isVisible !== false : pa.isVisible);
      pa.position = item.position ?? (isNew ? index : pa.position);

      if (item.customValue !== undefined) {
        pa.customValue =
          item.customValue === null || String(item.customValue).trim() === ''
            ? null
            : this.normalizeFreeValue(attribute, item.customValue, lang);
      }

      const saved = await manager.save(ProductAttribute, pa);

      if (item.values !== undefined) {
        await this.syncProductAttributeValues(manager, saved, attribute, item.values, lang);
      }
    }

    if (replace) {
      const keep = new Set(attributeIds);
      const toRemove = existing.filter((pa) => !keep.has(pa.attributeId)).map((pa) => pa.id);
      if (toRemove.length) {
        await manager.delete(ProductAttributeValue, { productAttributeId: In(toRemove) });
        await manager.delete(ProductAttribute, { id: In(toRemove) });
      }
    }
  }

  /** Même chose dans sa propre transaction (routes /attributes/products/...) */
  async syncProductAttributesTx(
    productId: string,
    input: unknown,
    lang: string,
    options: { replace?: boolean } = {},
  ): Promise<void> {
    await this.dataSource.transaction((manager) =>
      this.syncProductAttributes(manager, productId, input, lang, options),
    );
  }

  /** Valeurs autorisées d'un attribut pour un produit (la liste remplace l'ancienne) */
  async syncProductAttributeValues(
    manager: EntityManager,
    productAttribute: ProductAttribute,
    attribute: Attribute,
    values: ProductAttributeValueInputDto[],
    lang: string,
  ): Promise<void> {
    if (!Array.isArray(values)) {
      throw new BadRequestException(this.t('attribute.invalid_payload', lang));
    }
    if (values.length && !this.hasValueList(attribute.type)) {
      throw new BadRequestException(this.t('attribute.values_not_allowed', lang, { name: attribute.name }));
    }

    const existing = await manager.find(ProductAttributeValue, {
      where: { productAttributeId: productAttribute.id },
    });
    const existingMap = new Map<string, ProductAttributeValue>(existing.map((v: ProductAttributeValue) => [v.attributeValueId, v] as [string, ProductAttributeValue]));
    const keep = new Set<string>();
    let defaultSet = false;

    for (let index = 0; index < values.length; index++) {
      const input = values[index] ?? {};
      const av = await this.resolveAttributeValue(manager, attribute, input, lang, true);
      if (keep.has(av.id)) continue;
      keep.add(av.id);

      let pav = existingMap.get(av.id);
      if (!pav) {
        pav = manager.create(ProductAttributeValue, {
          productAttributeId: productAttribute.id,
          productId: productAttribute.productId,
          attributeId: attribute.id,
          attributeValueId: av.id,
        }) as ProductAttributeValue;
      }

      const adj = this.toNumber(input.priceAdjustment);
      if (adj !== undefined) pav.priceAdjustment = adj;
      else if (pav.priceAdjustment === undefined || pav.priceAdjustment === null) pav.priceAdjustment = 0;

      const isDefault = this.toBool(input.isDefault) ?? false;
      pav.isDefault = isDefault && !defaultSet;
      if (pav.isDefault) defaultSet = true;
      pav.isActive = this.toBool(input.isActive) ?? true;
      pav.position = this.toNumber(input.position) ?? index;

      await manager.save(ProductAttributeValue, pav);
    }

    const toRemove = existing.filter((v) => !keep.has(v.attributeValueId)).map((v) => v.id);
    if (toRemove.length) {
      await manager.delete(ProductAttributeValue, { id: In(toRemove) });
    }
  }

  /** Lien produit ↔ attribut (créé si besoin) — utilisé par les variations */
  private async ensureProductAttribute(
    manager: EntityManager,
    productId: string,
    attribute: Attribute,
  ): Promise<ProductAttribute> {
    const existing = await manager.findOne(ProductAttribute, {
      where: { productId, attributeId: attribute.id },
    });
    if (existing) return existing;

    const maxRow = await manager
      .createQueryBuilder(ProductAttribute, 'pa')
      .select('MAX(pa.position)', 'max')
      .where('pa.productId = :productId', { productId })
      .getRawOne<{ max: number | null }>();

    const pa = manager.create(ProductAttribute, {
      productId,
      attributeId: attribute.id,
      product: { id: productId } as Product,
      attribute: { id: attribute.id } as Attribute,
      isRequired: !!attribute.isRequired,
      isVariant: true,
      isVisible: attribute.isVisible !== false,
      position: Number(maxRow?.max ?? -1) + 1,
    });
    return manager.save(ProductAttribute, pa);
  }

  /** Valeur autorisée pour le produit (créée si besoin) — utilisé par les variations */
  private async ensureProductAttributeValue(
    manager: EntityManager,
    productAttribute: ProductAttribute,
    attributeValue: AttributeValue,
  ): Promise<void> {
    const existing = await manager.findOne(ProductAttributeValue, {
      where: { productAttributeId: productAttribute.id, attributeValueId: attributeValue.id },
    });
    if (existing) {
      if (!existing.isActive) {
        existing.isActive = true;
        await manager.save(ProductAttributeValue, existing);
      }
      return;
    }
    const count = await manager.count(ProductAttributeValue, {
      where: { productAttributeId: productAttribute.id },
    });
    await manager.save(
      ProductAttributeValue,
      manager.create(ProductAttributeValue, {
        productAttributeId: productAttribute.id,
        productId: productAttribute.productId,
        attributeId: attributeValue.attributeId,
        attributeValueId: attributeValue.id,
        priceAdjustment: 0,
        isDefault: false,
        isActive: true,
        position: count,
      }),
    );
  }

  async removeProductAttribute(productId: string, attributeId: string, lang: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const pa = await manager.findOne(ProductAttribute, { where: { productId, attributeId } });
      if (!pa) {
        throw new NotFoundException(this.t('attribute.not_found', lang, { id: attributeId }));
      }
      await manager.delete(ProductAttributeValue, { productAttributeId: pa.id });
      await manager.delete(ProductAttribute, { id: pa.id });
    });
  }

  // ============================================================
  // VARIATIONS
  // ============================================================

  normalizeVariationInputs(input: unknown, lang: string): ProductVariationInputDto[] | undefined {
    const parsed = this.parseJsonInput(input, 'attribute.invalid_variations', lang);
    if (parsed === undefined) return undefined;
    if (parsed === null) return [];
    if (!Array.isArray(parsed)) {
      throw new BadRequestException(this.t('attribute.invalid_variations', lang));
    }
    return parsed.map((raw) => {
      if (!raw || typeof raw !== 'object') {
        throw new BadRequestException(this.t('attribute.invalid_variations', lang));
      }
      return raw as ProductVariationInputDto;
    });
  }

  /**
   * Crée / met à jour les variations d'un produit.
   * - une variation avec `id` (ou un `sku` existant du produit) est mise à jour, pas recréée ;
   * - replace = true → les variations absentes sont supprimées,
   *   ou archivées (suppression douce) si elles figurent déjà dans des commandes.
   */
  async syncProductVariations(
    manager: EntityManager,
    productId: string,
    input: unknown,
    lang: string,
    options: { replace?: boolean } = {},
  ): Promise<ProductVariation[]> {
    const items = this.normalizeVariationInputs(input, lang);
    if (items === undefined) return [];
    const replace = options.replace !== false;

    const product = await manager.findOne(Product, { where: { id: productId } });
    if (!product) {
      throw new NotFoundException(this.t('attribute.product_not_found', lang));
    }

    const existing = await manager.find(ProductVariation, { where: { productId } });
    const byId = new Map<string, ProductVariation>(existing.map((v: ProductVariation) => [v.id, v] as [string, ProductVariation]));
    const bySku = new Map<string, ProductVariation>(existing.map((v: ProductVariation) => [v.sku, v] as [string, ProductVariation]));
    const kept = new Set<string>();
    const result: ProductVariation[] = [];

    for (let index = 0; index < items.length; index++) {
      const dto = items[index];
      let current: ProductVariation | undefined;
      if (dto.id) {
        current = byId.get(dto.id);
        if (!current) {
          throw new NotFoundException(this.t('attribute.variation_not_found', lang));
        }
      } else if (dto.sku) {
        current = bySku.get(String(dto.sku).trim());
      }
      if (current && kept.has(current.id)) {
        throw new ConflictException(this.t('attribute.variation_sku_exists', lang, { sku: current.sku }));
      }

      const saved = await this.upsertVariation(manager, product, dto, lang, current, index);
      kept.add(saved.id);
      result.push(saved);
    }

    if (replace) {
      for (const variation of existing) {
        if (!kept.has(variation.id)) {
          await this.removeVariationWithManager(manager, variation);
        }
      }
    }

    await this.ensureSingleDefaultVariation(manager, productId);
    return result;
  }

  /** Même chose dans sa propre transaction (routes /attributes/products/...) */
  async syncProductVariationsTx(
    productId: string,
    input: unknown,
    lang: string,
    options: { replace?: boolean } = {},
  ): Promise<void> {
    await this.dataSource.transaction((manager) =>
      this.syncProductVariations(manager, productId, input, lang, options),
    );
  }

  private async generateUniqueSku(manager: EntityManager, base: string, excludeId?: string): Promise<string> {
    const clean = (base || 'SKU').toUpperCase().replace(/[^A-Z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 200) || 'SKU';
    let candidate = clean;
    for (let i = 1; i < 1000; i++) {
      const found = await manager.findOne(ProductVariation, { where: { sku: candidate }, withDeleted: true });
      if (!found || found.id === excludeId) return candidate;
      candidate = `${clean}-${i + 1}`;
    }
    return `${clean}-${Date.now()}`;
  }

  /** Crée ou met à jour UNE variation (prix, stock, image, attributs) */
  async upsertVariation(
    manager: EntityManager,
    product: Product,
    dto: ProductVariationInputDto,
    lang: string,
    current?: ProductVariation,
    index = 0,
  ): Promise<ProductVariation> {
    const isNew = !current;
    const variation = current ?? manager.create(ProductVariation, { productId: product.id, product: { id: product.id } as Product });

    // ---------- SKU ----------
    const requestedSku = dto.sku !== undefined && dto.sku !== null ? String(dto.sku).trim() : '';
    if (requestedSku) {
      const owner = await manager.findOne(ProductVariation, { where: { sku: requestedSku }, withDeleted: true });
      if (owner && owner.id !== variation.id) {
        throw new ConflictException(this.t('attribute.variation_sku_exists', lang, { sku: requestedSku }));
      }
      variation.sku = requestedSku;
    } else if (isNew) {
      const base = `${slugify(product.name || 'produit', { lower: true, strict: true }).slice(0, 40)}-${Date.now().toString(36)}-${index + 1}`;
      variation.sku = await this.generateUniqueSku(manager, base);
    }

    // ---------- Prix ----------
    const retail = this.toNumber(dto.retailPrice);
    const wholesale = this.toNumber(dto.wholesalePrice);
    if ((retail !== undefined && retail < 0) || (wholesale !== undefined && wholesale < 0)) {
      throw new BadRequestException(this.t('attribute.variation_price_invalid', lang));
    }
    if (retail !== undefined) variation.retailPrice = retail;
    else if (isNew) variation.retailPrice = Number(product.detail ?? product.price ?? 0);
    if (wholesale !== undefined) variation.wholesalePrice = wholesale;
    else if (isNew) variation.wholesalePrice = Number(product.gros ?? variation.retailPrice ?? 0);

    // ---------- Stock / dimensions ----------
    const stock = this.toNumber(dto.stock);
    if (stock !== undefined) {
      if (stock < 0) throw new BadRequestException(this.t('attribute.variation_stock_invalid', lang));
      variation.stock = Math.floor(stock);
    } else if (isNew) {
      variation.stock = 0;
    }
    for (const key of ['weight', 'length', 'width', 'height'] as const) {
      if (dto[key] !== undefined) {
        const n = this.toNumber(dto[key]);
        (variation as any)[key] = n === undefined ? null : n;
      }
    }
    if (dto.barcode !== undefined) variation.barcode = dto.barcode ? String(dto.barcode) : (null as any);

    // ---------- Image ----------
    if (dto.imageId !== undefined) {
      if (dto.imageId === null || dto.imageId === '') {
        variation.imageId = null as any;
        variation.image = null as any;
      } else {
        const imageIdNumber = parseInt(String(dto.imageId), 10);
        if (isNaN(imageIdNumber)) {
          throw new BadRequestException(this.t('attribute.invalid_image_id', lang, { id: dto.imageId }));
        }
        const image = await manager.findOne(ImageProductEntity, { where: { id: imageIdNumber } });
        if (!image) {
          throw new NotFoundException(this.t('attribute.image_not_found', lang, { id: dto.imageId }));
        }
        variation.image = image;
        variation.imageId = String(image.id);
      }
    }

    // ---------- État ----------
    const isActive = this.toBool(dto.isActive);
    if (isActive !== undefined) variation.isActive = isActive;
    else if (isNew) variation.isActive = true;
    const isDefault = this.toBool(dto.isDefault);
    if (isDefault !== undefined) variation.isDefault = isDefault;
    else if (isNew) variation.isDefault = false;
    const position = this.toNumber(dto.position);
    if (position !== undefined) variation.position = Math.max(0, Math.floor(position));
    else if (isNew) variation.position = index;
    if (dto.name !== undefined) variation.name = dto.name ? String(dto.name).trim().slice(0, 255) : null;

    // On n'enregistre pas les attributs par cascade : ils sont gérés juste après
    const { attributeValues: _ignored, ...toSave } = variation as any;
    const saved = await manager.save(ProductVariation, toSave as ProductVariation);

    if (dto.attributeValues !== undefined) {
      const autoName = await this.setVariationAttributeValues(manager, product.id, saved, dto.attributeValues ?? [], lang);
      if ((dto.name === undefined || dto.name === null || dto.name === '') && (isNew || !saved.name)) {
        saved.name = autoName;
        await manager.update(ProductVariation, { id: saved.id }, { name: autoName });
      }
    }

    if (saved.isDefault) {
      await manager.update(
        ProductVariation,
        { productId: product.id, id: Not(saved.id) },
        { isDefault: false },
      );
    }
    return saved;
  }

  /**
   * Enregistre la combinaison d'attributs d'une variation (Couleur = Rouge, Taille = XL).
   * Lie automatiquement l'attribut et la valeur au produit s'ils ne le sont pas encore.
   * Retourne le nom généré ("Rouge / XL").
   */
  private async setVariationAttributeValues(
    manager: EntityManager,
    productId: string,
    variation: ProductVariation,
    values: VariationAttributeValueInputDto[],
    lang: string,
  ): Promise<string | null> {
    if (!Array.isArray(values)) {
      throw new BadRequestException(this.t('attribute.invalid_variations', lang));
    }

    const seen = new Set<string>();
    const resolved: { attribute: Attribute; value: AttributeValue; productAttribute: ProductAttribute }[] = [];

    for (const input of values) {
      if (!input || !input.attributeId) {
        throw new BadRequestException(this.t('attribute.invalid_variations', lang));
      }
      const attribute = await manager.findOne(Attribute, { where: { id: input.attributeId } });
      if (!attribute) {
        throw new NotFoundException(this.t('attribute.not_found', lang, { id: input.attributeId }));
      }
      if (seen.has(attribute.id)) {
        throw new BadRequestException(this.t('attribute.duplicate_in_variation', lang, { name: attribute.name }));
      }
      seen.add(attribute.id);

      const value = await this.resolveAttributeValue(manager, attribute, input, lang, true);
      const productAttribute = await this.ensureProductAttribute(manager, productId, attribute);
      await this.ensureProductAttributeValue(manager, productAttribute, value);
      resolved.push({ attribute, value, productAttribute });
    }

    // Une même combinaison ne peut exister qu'une fois par produit
    if (resolved.length) {
      const signature = resolved.map((r) => r.value.id).sort().join('|');
      const others = await manager.find(ProductVariation, {
        where: { productId, id: Not(variation.id) },
        relations: ['attributeValues'],
      });
      for (const other of others) {
        const otherSig = (other.attributeValues ?? []).map((v) => v.attributeValueId).sort().join('|');
        if (otherSig && otherSig === signature) {
          throw new ConflictException(
            this.t('attribute.variation_combination_exists', lang, {
              label: resolved.map((r) => this.valueLabel(r.value)).join(' / '),
              sku: other.sku,
            }),
          );
        }
      }
    }

    await manager.delete(VariationAttributeValue, { variationId: variation.id });
    if (resolved.length) {
      await manager.save(
        VariationAttributeValue,
        resolved.map((r) =>
          manager.create(VariationAttributeValue, {
            variationId: variation.id,
            attributeId: r.attribute.id,
            attributeValueId: r.value.id,
          }),
        ),
      );
    }

    return this.buildVariationName(
      resolved.map((r) => ({ position: r.productAttribute.position ?? 0, label: this.valueLabel(r.value) })),
    );
  }

  private async ensureSingleDefaultVariation(manager: EntityManager, productId: string): Promise<void> {
    const defaults = await manager.find(ProductVariation, {
      where: { productId, isDefault: true },
      order: { updatedAt: 'DESC' },
    });
    if (defaults.length > 1) {
      await manager.update(
        ProductVariation,
        { id: In(defaults.slice(1).map((v) => v.id)) },
        { isDefault: false },
      );
    }
  }

  /** Supprime la variation, ou l'archive si elle est déjà dans des commandes */
  private async removeVariationWithManager(
    manager: EntityManager,
    variation: ProductVariation,
  ): Promise<'deleted' | 'archived'> {
    const used =
      (await manager.count(OrderItemEntity, { where: { variationId: variation.id } })) +
      (await manager.count(SubOrderItemEntity, { where: { variationId: variation.id } }));

    if (used > 0) {
      await manager.update(ProductVariation, { id: variation.id }, { isActive: false, isDefault: false });
      await manager.softDelete(ProductVariation, { id: variation.id });
      return 'archived';
    }
    await manager.delete(VariationAttributeValue, { variationId: variation.id });
    await manager.delete(ProductVariation, { id: variation.id });
    return 'deleted';
  }

  async createVariation(productId: string, dto: ProductVariationInputDto, lang: string): Promise<ProductVariation> {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.findOne(Product, { where: { id: productId } });
      if (!product) throw new NotFoundException(this.t('attribute.product_not_found', lang));
      const count = await manager.count(ProductVariation, { where: { productId } });
      const { id: _id, ...data } = dto;
      const saved = await this.upsertVariation(manager, product, data, lang, undefined, count);
      return this.loadVariation(manager, saved.id);
    });
  }

  async updateVariation(variationId: string, dto: ProductVariationInputDto, lang: string): Promise<ProductVariation> {
    return this.dataSource.transaction(async (manager) => {
      const variation = await manager.findOne(ProductVariation, { where: { id: variationId } });
      if (!variation) throw new NotFoundException(this.t('attribute.variation_not_found', lang));
      const product = await manager.findOne(Product, { where: { id: variation.productId } });
      if (!product) throw new NotFoundException(this.t('attribute.product_not_found', lang));
      const saved = await this.upsertVariation(manager, product, dto, lang, variation, variation.position ?? 0);
      return this.loadVariation(manager, saved.id);
    });
  }

  async deleteVariation(variationId: string, lang: string): Promise<'deleted' | 'archived'> {
    return this.dataSource.transaction(async (manager) => {
      const variation = await manager.findOne(ProductVariation, { where: { id: variationId } });
      if (!variation) throw new NotFoundException(this.t('attribute.variation_not_found', lang));
      return this.removeVariationWithManager(manager, variation);
    });
  }

  async getVariationProductId(variationId: string, lang: string): Promise<string> {
    const variation = await this.dataSource
      .getRepository(ProductVariation)
      .findOne({ where: { id: variationId }, select: ['id', 'productId'] });
    if (!variation) throw new NotFoundException(this.t('attribute.variation_not_found', lang));
    return variation.productId;
  }

  private async loadVariation(manager: EntityManager, id: string): Promise<ProductVariation> {
    const variation = await manager.findOne(ProductVariation, {
      where: { id },
      relations: ['image', 'attributeValues', 'attributeValues.attribute', 'attributeValues.attributeValue'],
    });
    return variation!;
  }

  async listVariations(productId: string, includeInactive: boolean): Promise<ProductVariation[]> {
    return this.dataSource.getRepository(ProductVariation).find({
      where: includeInactive ? { productId } : { productId, isActive: true },
      relations: ['image', 'attributeValues', 'attributeValues.attribute', 'attributeValues.attributeValue'],
      order: { position: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * Génère toutes les combinaisons manquantes à partir des valeurs autorisées
   * des attributs "variation" du produit (ex : 3 couleurs × 4 tailles = 12 variations).
   */
  async generateVariations(productId: string, dto: GenerateVariationsDto, lang: string): Promise<ProductVariation[]> {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.findOne(Product, { where: { id: productId } });
      if (!product) throw new NotFoundException(this.t('attribute.product_not_found', lang));

      const productAttributes = await manager.find(ProductAttribute, {
        where: dto.attributeIds?.length
          ? { productId, attributeId: In(dto.attributeIds) }
          : { productId, isVariant: true },
        relations: ['attribute', 'values', 'values.attributeValue'],
        order: { position: 'ASC' },
      });

      const axes = productAttributes
        .map((pa) => ({
          pa,
          values: (pa.values ?? [])
            .filter((v) => v.isActive && v.attributeValue && v.attributeValue.isActive !== false)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
        }))
        .filter((axis) => axis.values.length > 0);

      if (!axes.length) {
        throw new BadRequestException(this.t('attribute.no_values_to_generate', lang));
      }

      const total = axes.reduce((acc, axis) => acc * axis.values.length, 1);
      if (total > MAX_GENERATED_VARIATIONS) {
        throw new BadRequestException(
          this.t('attribute.too_many_combinations', lang, { count: total, max: MAX_GENERATED_VARIATIONS }),
        );
      }

      // Combinaisons déjà présentes
      const existing = await manager.find(ProductVariation, { where: { productId }, relations: ['attributeValues'] });
      const existingSignatures = new Set(
        existing.map((v) => (v.attributeValues ?? []).map((x) => x.attributeValueId).sort().join('|')),
      );

      let combos: ProductAttributeValue[][] = [[]];
      for (const axis of axes) {
        const next: ProductAttributeValue[][] = [];
        for (const combo of combos) for (const value of axis.values) next.push([...combo, value]);
        combos = next;
      }

      const prefix = (dto.skuPrefix && dto.skuPrefix.trim()) || slugify(product.name || 'produit', { lower: true, strict: true }).slice(0, 40);
      const baseRetail = this.toNumber(dto.retailPrice) ?? Number(product.detail ?? product.price ?? 0);
      const baseWholesale = this.toNumber(dto.wholesalePrice) ?? Number(product.gros ?? baseRetail);
      const created: ProductVariation[] = [];
      let position = existing.length;

      for (const combo of combos) {
        const signature = combo.map((c) => c.attributeValueId).sort().join('|');
        if (existingSignatures.has(signature)) continue;

        const adjustment = combo.reduce((sum, c) => sum + Number(c.priceAdjustment ?? 0), 0);
        const skuBase = `${prefix}-${combo.map((c) => slugify(c.attributeValue.value, { lower: true, strict: true }).slice(0, 20)).join('-')}`;
        const saved = await this.upsertVariation(
          manager,
          product,
          {
            sku: await this.generateUniqueSku(manager, skuBase),
            retailPrice: Math.max(0, baseRetail + adjustment),
            wholesalePrice: Math.max(0, baseWholesale + adjustment),
            stock: this.toNumber(dto.stock) ?? 0,
            isActive: true,
            position: position++,
            attributeValues: combo.map((c) => ({ attributeId: c.attributeId, attributeValueId: c.attributeValueId })),
          },
          lang,
          undefined,
          position,
        );
        existingSignatures.add(signature);
        created.push(saved);
      }

      await this.ensureSingleDefaultVariation(manager, productId);
      if (!created.length) return [];
      return manager.find(ProductVariation, {
        where: { id: In(created.map((v) => v.id)) },
        relations: ['image', 'attributeValues', 'attributeValues.attribute', 'attributeValues.attributeValue'],
        order: { position: 'ASC' },
      });
    });
  }

  /**
   * Trouve la variation active qui correspond aux choix du client.
   * Retourne null si aucune variation ne correspond.
   */
  async findVariationBySelection(
    manager: EntityManager,
    productId: string,
    selection: VariationAttributeValueInputDto[],
    lang: string,
  ): Promise<ProductVariation | null> {
    const chosen = new Map<string, string>(); // attributeId → attributeValueId
    for (const input of selection ?? []) {
      if (!input?.attributeId) continue;
      const attribute = await manager.findOne(Attribute, { where: { id: input.attributeId } });
      if (!attribute || !this.hasValueList(attribute.type)) continue;
      if (!input.attributeValueId && !input.value) continue;
      const value = await this.resolveAttributeValue(manager, attribute, input, lang, false);
      chosen.set(attribute.id, value.id);
    }
    if (!chosen.size) return null;

    const variations = await manager.find(ProductVariation, {
      where: { productId, isActive: true },
      relations: ['image', 'attributeValues', 'attributeValues.attribute', 'attributeValues.attributeValue'],
    });

    let best: ProductVariation | null = null;
    for (const variation of variations) {
      const vavs = variation.attributeValues ?? [];
      if (!vavs.length) continue;
      const matches = vavs.every((v) => chosen.get(v.attributeId) === v.attributeValueId);
      if (!matches) continue;
      if (!best || vavs.length > (best.attributeValues?.length ?? 0)) best = variation;
    }
    return best;
  }

  async resolveVariation(productId: string, selection: VariationAttributeValueInputDto[], lang: string) {
    const product = await this.dataSource.getRepository(Product).findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException(this.t('attribute.product_not_found', lang));
    return this.findVariationBySelection(this.dataSource.manager, productId, selection, lang);
  }

  // ============================================================
  // CONFIGURATION COMPLÈTE D'UN PRODUIT (pour l'app / le site)
  // ============================================================

  async getProductAttributeConfig(productId: string, lang: string, includeInactive = false) {
    const manager = this.dataSource.manager;
    const product = await manager.findOne(Product, { where: { id: productId } });
    if (!product) throw new NotFoundException(this.t('attribute.product_not_found', lang));

    const productAttributes = await manager.find(ProductAttribute, {
      where: { productId },
      relations: ['attribute', 'values', 'values.attributeValue'],
      order: { position: 'ASC' },
    });
    const variations = await this.listVariations(productId, includeInactive);

    // Valeurs utilisées par les variations mais pas encore déclarées (anciennes données)
    const fromVariations = new Map<string, Map<string, AttributeValue>>();
    for (const v of variations) {
      for (const vav of v.attributeValues ?? []) {
        if (!vav.attributeValue) continue;
        if (!fromVariations.has(vav.attributeId)) fromVariations.set(vav.attributeId, new Map());
        fromVariations.get(vav.attributeId)!.set(vav.attributeValueId, vav.attributeValue);
      }
    }

    const attributes = productAttributes
      .filter((pa) => pa.attribute)
      .map((pa) => {
        const declared = (pa.values ?? [])
          .filter((v) => v.attributeValue && (includeInactive || (v.isActive && v.attributeValue.isActive !== false)))
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((v) => ({
            id: v.id,
            attributeValueId: v.attributeValueId,
            value: v.attributeValue.value,
            displayName: v.attributeValue.displayName ?? v.attributeValue.value,
            color: v.attributeValue.color ?? null,
            imageUrl: v.attributeValue.imageUrl ?? null,
            priceAdjustment: Number(v.priceAdjustment ?? 0),
            isDefault: v.isDefault,
            isActive: v.isActive,
            position: v.position,
          }));
        const declaredIds = new Set(declared.map((d) => d.attributeValueId));
        const extra = Array.from(fromVariations.get(pa.attributeId)?.values() ?? [])
          .filter((av) => !declaredIds.has(av.id))
          .map((av, i) => ({
            id: null,
            attributeValueId: av.id,
            value: av.value,
            displayName: av.displayName ?? av.value,
            color: av.color ?? null,
            imageUrl: av.imageUrl ?? null,
            priceAdjustment: 0,
            isDefault: false,
            isActive: true,
            position: declared.length + i,
          }));

        return {
          id: pa.id,
          attributeId: pa.attributeId,
          name: pa.attribute.name,
          slug: pa.attribute.slug,
          type: pa.attribute.type,
          unit: pa.attribute.unit ?? null,
          isRequired: pa.isRequired,
          isVariant: pa.isVariant,
          isVisible: pa.isVisible,
          position: pa.position,
          customValue: pa.customValue ?? null,
          values: [...declared, ...extra],
        };
      });

    return {
      productId,
      hasVariations: variations.length > 0,
      attributes,
      variations: variations.map((v) => ({
        id: v.id,
        sku: v.sku,
        name: v.name ?? null,
        retailPrice: Number(v.retailPrice),
        wholesalePrice: Number(v.wholesalePrice),
        stock: v.stock,
        isActive: v.isActive,
        isDefault: v.isDefault,
        position: v.position,
        barcode: v.barcode ?? null,
        weight: v.weight ?? null,
        length: v.length ?? null,
        width: v.width ?? null,
        height: v.height ?? null,
        image: v.image ?? null,
        attributes: (v.attributeValues ?? [])
          .filter((x) => x.attribute && x.attributeValue)
          .map((x) => ({
            attributeId: x.attributeId,
            attributeValueId: x.attributeValueId,
            name: x.attribute.name,
            type: x.attribute.type,
            value: x.attributeValue.value,
            displayName: x.attributeValue.displayName ?? x.attributeValue.value,
            color: x.attributeValue.color ?? null,
            imageUrl: x.attributeValue.imageUrl ?? null,
          })),
      })),
    };
  }

  // ============================================================
  // CATÉGORIE ↔ ATTRIBUTS
  // ============================================================

  async syncCategoryAttributes(
    categoryId: string,
    items: CategoryAttributeInputDto[],
    replace: boolean,
    lang: string,
  ): Promise<CategoryAttribute[]> {
    return this.dataSource.transaction(async (manager) => {
      const category = await manager.findOne(CategoryEntity, { where: { id: categoryId } });
      if (!category) throw new NotFoundException(this.t('attribute.category_not_found', lang));

      const ids = Array.from(new Set((items ?? []).map((i) => i.attributeId)));
      const attributes = ids.length ? await manager.find(Attribute, { where: { id: In(ids) } }) : [];
      const found = new Set(attributes.map((a) => a.id));
      for (const id of ids) {
        if (!found.has(id)) throw new NotFoundException(this.t('attribute.not_found', lang, { id }));
      }

      const existing = await manager.find(CategoryAttribute, { where: { categoryId } });
      const map = new Map<string, CategoryAttribute>(existing.map((c: CategoryAttribute) => [c.attributeId, c] as [string, CategoryAttribute]));

      for (let index = 0; index < (items ?? []).length; index++) {
        const item = items[index];
        let ca = map.get(item.attributeId);
        if (!ca) {
          ca = manager.create(CategoryAttribute, {
            categoryId,
            attributeId: item.attributeId,
            category: { id: categoryId } as CategoryEntity,
            attribute: { id: item.attributeId } as Attribute,
          }) as CategoryAttribute;
          map.set(item.attributeId, ca);
        }
        ca.isRequired = item.isRequired ?? ca.isRequired ?? false;
        ca.position = item.position ?? index;
        await manager.save(CategoryAttribute, ca);
      }

      if (replace) {
        const toRemove = existing.filter((c) => !ids.includes(c.attributeId)).map((c) => c.id);
        if (toRemove.length) await manager.delete(CategoryAttribute, { id: In(toRemove) });
      }

      return manager.find(CategoryAttribute, {
        where: { categoryId },
        relations: ['attribute', 'attribute.values'],
        order: { position: 'ASC' },
      });
    });
  }

  async removeCategoryAttribute(categoryId: string, attributeId: string, lang: string): Promise<void> {
    const result = await this.dataSource.getRepository(CategoryAttribute).delete({ categoryId, attributeId });
    if (!result.affected) {
      throw new NotFoundException(this.t('attribute.not_found', lang, { id: attributeId }));
    }
  }

  // ============================================================
  // COMMANDE ↔ ATTRIBUTS
  // ============================================================

  /**
   * Vérifie la variation / les attributs choisis pour une ligne de commande
   * et prépare la copie à enregistrer. À appeler AVANT le paiement.
   *
   * Compatibilité : si l'app n'envoie ni variationId ni attributs (ancienne version),
   * rien n'est exigé, sauf si ORDER_ENFORCE_REQUIRED_ATTRIBUTES=true.
   */
  async resolveOrderItemSelection(
    manager: EntityManager,
    product: Product,
    item: OrderItemSelectionInput,
    lang: string,
  ): Promise<OrderItemSelection> {
    const empty: OrderItemSelection = {
      variation: null,
      variationId: null,
      sku: null,
      variationLabel: null,
      attributesSnapshot: null,
      priceAdjustment: 0,
    };

    const inputs = Array.isArray(item.attributes) ? item.attributes.filter((a) => a && a.attributeId) : [];
    const clientSentSelection = !!item.variationId || inputs.length > 0;
    const enforceAlways = String(process.env.ORDER_ENFORCE_REQUIRED_ATTRIBUTES ?? 'false').toLowerCase() === 'true';

    if (!clientSentSelection && !enforceAlways) return empty;

    const productAttributes = await manager.find(ProductAttribute, {
      where: { productId: product.id },
      relations: ['attribute', 'values', 'values.attributeValue'],
      order: { position: 'ASC' },
    });

    const paMap = new Map<string, ProductAttribute>(
      productAttributes
        .filter((pa: ProductAttribute) => pa.attribute)
        .map((pa: ProductAttribute) => [pa.attributeId, pa] as [string, ProductAttribute]),
    );
    const snapshot = new Map<string, OrderItemAttributeSnapshot>();
    let variation: ProductVariation | null = null;

    // ---------- 1. Variation choisie ----------
    const loadVariation = async (id: string) =>
      manager.findOne(ProductVariation, {
        where: { id },
        relations: ['attributeValues', 'attributeValues.attribute', 'attributeValues.attributeValue'],
      });

    if (item.variationId) {
      variation = await loadVariation(item.variationId);
      if (!variation) {
        throw new NotFoundException(this.t('order.variation_not_found', lang, { productName: product.name }));
      }
      if (variation.productId !== product.id) {
        throw new BadRequestException(this.t('order.variation_wrong_product', lang, { productName: product.name }));
      }
    } else if (inputs.length) {
      // Pas de variationId : on cherche la variation qui correspond aux choix
      variation = await this.findVariationBySelection(
        manager,
        product.id,
        inputs.map((a) => ({
          attributeId: a.attributeId,
          attributeValueId: a.attributeValueId ?? undefined,
          value: a.value ?? undefined,
        })),
        lang,
      ).catch(() => null);
      if (variation) variation = await loadVariation(variation.id);
    }

    if (variation) {
      if (!variation.isActive) {
        throw new BadRequestException(this.t('order.variation_unavailable', lang, { sku: variation.sku, productName: product.name }));
      }
      const checkStock = String(process.env.ORDER_CHECK_VARIATION_STOCK ?? 'false').toLowerCase() === 'true';
      if (checkStock && Number(variation.stock ?? 0) < Number(item.quantity ?? 1)) {
        throw new BadRequestException(
          this.t('order.variation_out_of_stock', lang, {
            sku: variation.sku,
            stock: variation.stock ?? 0,
            productName: product.name,
          }),
        );
      }
      for (const vav of variation.attributeValues ?? []) {
        if (!vav.attribute || !vav.attributeValue) continue;
        snapshot.set(vav.attributeId, {
          attributeId: vav.attributeId,
          attributeValueId: vav.attributeValueId,
          name: vav.attribute.name,
          slug: vav.attribute.slug,
          type: vav.attribute.type,
          value: vav.attributeValue.value,
          displayName: vav.attributeValue.displayName ?? vav.attributeValue.value,
          color: vav.attributeValue.color ?? null,
          imageUrl: vav.attributeValue.imageUrl ?? null,
          priceAdjustment: 0, // le prix de la variation inclut déjà tout
        });
      }
    }

    // ---------- 2. Attributs choisis ----------
    for (const input of inputs) {
      const pa = paMap.get(input.attributeId);
      if (!pa) {
        const attr = await manager.findOne(Attribute, { where: { id: input.attributeId } });
        throw new BadRequestException(
          this.t('order.attribute_not_for_product', lang, {
            name: attr?.name ?? input.attributeId,
            productName: product.name,
          }),
        );
      }
      const attribute = pa.attribute;

      if (this.hasValueList(attribute.type)) {
        if (!input.attributeValueId && !(input.value && String(input.value).trim())) {
          throw new BadRequestException(this.t('order.attribute_value_required', lang, { name: attribute.name }));
        }
        let value: AttributeValue;
        try {
          value = await this.resolveAttributeValue(manager, attribute, input, lang, false);
        } catch {
          throw new BadRequestException(
            this.t('order.attribute_value_not_allowed', lang, {
              value: input.value ?? input.attributeValueId,
              name: attribute.name,
            }),
          );
        }

        const already = snapshot.get(attribute.id);
        if (already) {
          if (already.attributeValueId !== value.id) {
            throw new BadRequestException(this.t('order.attribute_conflicts_variation', lang, { name: attribute.name }));
          }
          continue;
        }

        // Si le produit déclare des valeurs autorisées, la valeur doit en faire partie
        const allowed = (pa.values ?? []).filter((v) => v.isActive);
        const allowedValue = allowed.find((v) => v.attributeValueId === value.id);
        if (allowed.length && !allowedValue) {
          throw new BadRequestException(
            this.t('order.attribute_value_not_allowed', lang, { value: this.valueLabel(value), name: attribute.name }),
          );
        }
        if (value.isActive === false) {
          throw new BadRequestException(
            this.t('order.attribute_value_not_allowed', lang, { value: this.valueLabel(value), name: attribute.name }),
          );
        }

        snapshot.set(attribute.id, {
          attributeId: attribute.id,
          attributeValueId: value.id,
          name: attribute.name,
          slug: attribute.slug,
          type: attribute.type,
          value: value.value,
          displayName: value.displayName ?? value.value,
          color: value.color ?? null,
          imageUrl: value.imageUrl ?? null,
          priceAdjustment: variation ? 0 : Number(allowedValue?.priceAdjustment ?? 0),
        });
      } else {
        const text = this.normalizeFreeValue(attribute, input.value, lang);
        snapshot.set(attribute.id, {
          attributeId: attribute.id,
          attributeValueId: null,
          name: attribute.name,
          slug: attribute.slug,
          type: attribute.type,
          value: text,
          displayName: attribute.unit ? `${text} ${attribute.unit}` : text,
          color: null,
          imageUrl: null,
          priceAdjustment: 0,
        });
      }
    }

    // ---------- 3. Attributs obligatoires ----------
    for (const pa of productAttributes) {
      if (!pa.attribute || !pa.isRequired) continue;
      // Un attribut avec une valeur fixe (customValue) n'est pas un choix du client
      if (!this.hasValueList(pa.attribute.type) && pa.customValue) continue;
      if (!snapshot.has(pa.attributeId)) {
        throw new BadRequestException(
          this.t('order.attribute_required', lang, { name: pa.attribute.name, productName: product.name }),
        );
      }
    }

    // Ordre d'affichage = ordre des attributs du produit
    const order = new Map<string, number>(
      productAttributes.map((pa: ProductAttribute, i: number) => [pa.attributeId, pa.position ?? i] as [string, number]),
    );
    const list = Array.from(snapshot.values()).sort(
      (a, b) => (order.get(a.attributeId ?? '') ?? 999) - (order.get(b.attributeId ?? '') ?? 999),
    );

    return {
      variation,
      variationId: variation?.id ?? null,
      sku: variation?.sku ?? null,
      variationLabel: this.buildSelectionLabel(list) ?? variation?.name ?? null,
      attributesSnapshot: list.length ? list : null,
      priceAdjustment: list.reduce((sum, s) => sum + Number(s.priceAdjustment ?? 0), 0),
    };
  }

  /** Construit les lignes order_item_attributes (à attacher à orderItem.selectedAttributes) */
  buildOrderItemAttributes(
    manager: EntityManager,
    orderId: string,
    snapshot: OrderItemAttributeSnapshot[] | null,
  ): OrderItemAttribute[] {
    return (snapshot ?? []).map((s) =>
      manager.create(OrderItemAttribute, {
        orderId,
        attributeId: s.attributeId,
        attributeValueId: s.attributeValueId,
        attributeName: s.name.slice(0, 255),
        attributeSlug: s.slug ?? null,
        attributeType: s.type ?? null,
        value: String(s.value).slice(0, 255),
        displayName: s.displayName ?? null,
        color: s.color ?? null,
        imageUrl: s.imageUrl ?? null,
        priceAdjustment: Number(s.priceAdjustment ?? 0),
      }),
    );
  }

  /** Attributs choisis pour toutes les lignes d'une commande */
  async getOrderAttributes(orderId: string) {
    const items = await this.dataSource.getRepository(OrderItemEntity).find({
      where: { orderId },
      relations: ['product', 'variation', 'selectedAttributes'],
    });
    return items.map((item) => ({
      orderItemId: item.id,
      productId: item.productId,
      productName: item.product?.name ?? null,
      quantity: item.quantity,
      price: item.price,
      variationId: item.variationId ?? null,
      sku: item.sku ?? null,
      variationLabel: item.variationLabel ?? null,
      attributes: (item.selectedAttributes ?? []).map((a) => ({
        attributeId: a.attributeId ?? null,
        attributeValueId: a.attributeValueId ?? null,
        name: a.attributeName,
        type: a.attributeType ?? null,
        value: a.value,
        displayName: a.displayName ?? a.value,
        color: a.color ?? null,
        imageUrl: a.imageUrl ?? null,
        priceAdjustment: Number(a.priceAdjustment ?? 0),
      })),
    }));
  }

  /** Commandes contenant une variation donnée (statistiques / suivi) */
  async countOrdersForVariation(variationId: string): Promise<number> {
    return this.dataSource.getRepository(OrderItemEntity).count({
      where: { variationId, orderId: Not(IsNull()) },
    });
  }
}
