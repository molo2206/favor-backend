import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { I18nService } from 'src/libs/common/src';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { ProductAttributeService } from './product-attribute.service';
import {
  GenerateVariationsDto,
  ProductAttributeInputDto,
  ProductVariationInputDto,
  ResolveVariationDto,
  SyncCategoryAttributesDto,
  SyncProductAttributesDto,
  SyncProductVariationsDto,
} from './dto/product-attribute.dto';

const SUPPORTED_LANGS = ['fr', 'en', 'es', 'sw', 'ar'];

/**
 * ✅ Liaison des attributs avec les produits, les variations, les catégories et les commandes.
 * Préfixe : /attributes
 */
@Controller('attributes')
export class ProductAttributeController {
  constructor(
    private readonly productAttributeService: ProductAttributeService,
    private readonly i18n: I18nService,
  ) { }

  private lang(req: Request, user?: UserEntity): string {
    const query = (req as any).query ?? {};
    const fromQuery = typeof query.lang === 'string' ? (query.lang as string) : undefined;
    const fromHeader = (req.headers['x-lang'] as string) || (req.headers['accept-language'] as string);
    const raw = (fromQuery || fromHeader || user?.preferredLanguage || 'fr').split(',')[0].split(';')[0].trim().slice(0, 2).toLowerCase();
    return SUPPORTED_LANGS.includes(raw) ? raw : 'fr';
  }

  /** Les attributs d'une catégorie concernent toute la plateforme : réservé aux admins */
  private assertAdmin(user: UserEntity, lang: string): void {
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) {
      throw new ForbiddenException(this.i18n.translate('attribute.forbidden_admin', lang));
    }
  }

  // ============================================================
  // PRODUIT : CONFIGURATION COMPLÈTE (public)
  // GET /attributes/products/:productId?all=true
  // → attributs + valeurs autorisées + variations (pour afficher les choix au client)
  // ============================================================
  @Get('products/:productId')
  async getProductConfig(
    @Req() req: Request,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('all') all?: string,
  ) {
    const lang = this.lang(req);
    const data = await this.productAttributeService.getProductAttributeConfig(productId, lang, all === 'true');
    return { message: this.i18n.translate('attribute.product_config', lang), data };
  }

  // ============================================================
  // PRODUIT ↔ ATTRIBUTS
  // ============================================================

  /** Remplace (ou complète si replace=false) les attributs du produit */
  @Put('products/:productId/attributes')
  @UseGuards(AuthentificationGuard)
  async syncProductAttributes(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: SyncProductAttributesDto,
  ) {
    const lang = this.lang(req, user);
    await this.productAttributeService.assertCanManageProduct(user, productId, lang);
    await this.productAttributeService.syncProductAttributesTx(productId, dto.attributes, lang, {
      replace: dto.replace !== false,
    });
    const data = await this.productAttributeService.getProductAttributeConfig(productId, lang, true);
    return { message: this.i18n.translate('attribute.product_attributes_updated', lang), data };
  }

  /** Ajoute ou met à jour UN attribut du produit (sans toucher aux autres) */
  @Post('products/:productId/attributes')
  @UseGuards(AuthentificationGuard)
  async upsertProductAttribute(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ProductAttributeInputDto,
  ) {
    const lang = this.lang(req, user);
    await this.productAttributeService.assertCanManageProduct(user, productId, lang);
    await this.productAttributeService.syncProductAttributesTx(productId, [dto], lang, { replace: false });
    const data = await this.productAttributeService.getProductAttributeConfig(productId, lang, true);
    return { message: this.i18n.translate('attribute.product_attributes_updated', lang), data };
  }

  @Delete('products/:productId/attributes/:attributeId')
  @UseGuards(AuthentificationGuard)
  async removeProductAttribute(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('attributeId', ParseUUIDPipe) attributeId: string,
  ) {
    const lang = this.lang(req, user);
    await this.productAttributeService.assertCanManageProduct(user, productId, lang);
    await this.productAttributeService.removeProductAttribute(productId, attributeId, lang);
    const data = await this.productAttributeService.getProductAttributeConfig(productId, lang, true);
    return { message: this.i18n.translate('attribute.product_attribute_removed', lang), data };
  }

  // ============================================================
  // VARIATIONS
  // ============================================================

  @Get('products/:productId/variations')
  async listVariations(
    @Req() req: Request,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('all') all?: string,
  ) {
    const lang = this.lang(req);
    const data = await this.productAttributeService.listVariations(productId, all === 'true');
    return { message: this.i18n.translate('attribute.variations_list', lang), data };
  }

  /** Trouver la variation correspondant aux choix du client (prix, stock, image) */
  @Post('products/:productId/variations/resolve')
  async resolveVariation(
    @Req() req: Request,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ResolveVariationDto,
  ) {
    const lang = this.lang(req);
    const data = await this.productAttributeService.resolveVariation(productId, dto.attributes, lang);
    return {
      message: this.i18n.translate(data ? 'attribute.variation_found' : 'attribute.variation_no_match', lang),
      data,
    };
  }

  /** Remplace toutes les variations du produit (upsert par id / sku) */
  @Put('products/:productId/variations')
  @UseGuards(AuthentificationGuard)
  async syncVariations(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: SyncProductVariationsDto,
  ) {
    const lang = this.lang(req, user);
    await this.productAttributeService.assertCanManageProduct(user, productId, lang);
    await this.productAttributeService.syncProductVariationsTx(productId, dto.variations, lang, {
      replace: dto.replace !== false,
    });
    const data = await this.productAttributeService.getProductAttributeConfig(productId, lang, true);
    return { message: this.i18n.translate('attribute.variations_updated', lang), data };
  }

  /** Génère toutes les combinaisons manquantes (Couleur × Taille…) */
  @Post('products/:productId/variations/generate')
  @UseGuards(AuthentificationGuard)
  async generateVariations(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: GenerateVariationsDto,
  ) {
    const lang = this.lang(req, user);
    await this.productAttributeService.assertCanManageProduct(user, productId, lang);
    const data = await this.productAttributeService.generateVariations(productId, dto ?? {}, lang);
    return {
      message: this.i18n.translate('attribute.variations_generated', lang, { count: data.length }),
      data,
    };
  }

  @Post('products/:productId/variations')
  @UseGuards(AuthentificationGuard)
  async createVariation(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ProductVariationInputDto,
  ) {
    const lang = this.lang(req, user);
    await this.productAttributeService.assertCanManageProduct(user, productId, lang);
    const data = await this.productAttributeService.createVariation(productId, dto, lang);
    return { message: this.i18n.translate('attribute.variation_created', lang), data };
  }

  @Patch('variations/:id')
  @UseGuards(AuthentificationGuard)
  async updateVariation(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProductVariationInputDto,
  ) {
    const lang = this.lang(req, user);
    const productId = await this.productAttributeService.getVariationProductId(id, lang);
    await this.productAttributeService.assertCanManageProduct(user, productId, lang);
    const data = await this.productAttributeService.updateVariation(id, dto, lang);
    return { message: this.i18n.translate('attribute.variation_updated', lang), data };
  }

  /** Supprime la variation, ou l'archive si elle a déjà été commandée */
  @Delete('variations/:id')
  @UseGuards(AuthentificationGuard)
  async deleteVariation(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const lang = this.lang(req, user);
    const productId = await this.productAttributeService.getVariationProductId(id, lang);
    await this.productAttributeService.assertCanManageProduct(user, productId, lang);
    const result = await this.productAttributeService.deleteVariation(id, lang);
    return {
      message: this.i18n.translate(
        result === 'archived' ? 'attribute.variation_archived' : 'attribute.variation_deleted',
        lang,
      ),
      data: { id, result },
    };
  }

  // ============================================================
  // CATÉGORIE ↔ ATTRIBUTS
  // ============================================================

  @Put('categories/:categoryId')
  @UseGuards(AuthentificationGuard)
  async syncCategoryAttributes(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('categoryId') categoryId: string,
    @Body() dto: SyncCategoryAttributesDto,
  ) {
    const lang = this.lang(req, user);
    this.assertAdmin(user, lang);
    const data = await this.productAttributeService.syncCategoryAttributes(
      categoryId,
      dto.attributes,
      dto.replace !== false,
      lang,
    );
    return { message: this.i18n.translate('attribute.category_attributes_updated', lang), data };
  }

  @Delete('categories/:categoryId/:attributeId')
  @UseGuards(AuthentificationGuard)
  async removeCategoryAttribute(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('categoryId') categoryId: string,
    @Param('attributeId', ParseUUIDPipe) attributeId: string,
  ) {
    const lang = this.lang(req, user);
    this.assertAdmin(user, lang);
    await this.productAttributeService.removeCategoryAttribute(categoryId, attributeId, lang);
    return { message: this.i18n.translate('attribute.category_attributes_updated', lang), data: { categoryId, attributeId } };
  }

  // ============================================================
  // COMMANDE ↔ ATTRIBUTS
  // ============================================================

  @Get('orders/:orderId')
  @UseGuards(AuthentificationGuard)
  async getOrderAttributes(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    const lang = this.lang(req, user);
    const data = await this.productAttributeService.getOrderAttributes(orderId);
    return { message: this.i18n.translate('attribute.order_attributes', lang), data };
  }
}
