/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  ValidationPipe,
  UsePipes,
  UseInterceptors,
  UploadedFiles,
  Query,
  BadRequestException,
  Delete,
  UploadedFile,
  Req,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { Product } from './entities/product.entity';
import { ProductService } from './products.service';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { CurrentUser } from '../users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { UpdateProductStatusDto } from './dto/update-product-status.dto';
import { Public } from 'src/users/utility/decorators/public.decorator';
import { FuelType } from './enum/fuelType_enum';
import { Transmission } from './enum/transmission.enum';
import { Type_rental_both_sale_car } from './enum/type_rental_both_sale_car';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { CreateWishlistDto } from './dto/create-wishlist.dto';
import { CreateProductAdminDto } from './dto/create-product.admin.dto';
import { CreateBrandDto } from './dto/create-brand.dto';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { PaginatedResponseDto } from './dto/paginated-response.dto';
import { CompanyPermissionsGuard } from 'src/users/utility/guards/company-permissions.guard';
import { Permissions } from 'src/users/utility/guards/permissions.guard';
import { I18nService } from 'src/libs/common/src';
import { Request } from 'express';

export type BackgroundType =
  | 'white'
  | 'black'
  | 'color'
  | 'gradient'
  | 'transparent';
export interface BackgroundOptions {
  type: BackgroundType;
  color?: string;
  secondColor?: string;
  gradientDirection?: 'vertical' | 'horizontal' | 'diagonal';
  opacity?: number;
}

@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly i18n: I18nService,
  ) { }

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'fr';
    const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
    const supported = ['fr', 'en', 'sw', 'es', 'ar'];
    return supported.includes(primary) ? primary : 'fr';
  }

  @Post()
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.CREATE, 'products')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(FilesInterceptor('images', 30))
  async create(
    @Req() req: Request,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    if (!files || files.length < 1 || files.length > 30) {
      throw new BadRequestException(
        await this.i18n.translate('image_count_invalid', lang),
      );
    }

    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('no_active_company', lang),
      );
    }

    let specifications;
    if (body.specifications) {
      try {
        specifications = JSON.parse(body.specifications);
      } catch (error) {
        throw new BadRequestException(
          await this.i18n.translate('invalid_specifications', lang),
        );
      }
    }

    let attributes;
    if (body.attributes) {
      try {
        attributes = JSON.parse(body.attributes);
      } catch (error) {
        throw new BadRequestException(
          await this.i18n.translate('invalid_attributes', lang),
        );
      }
    }

    let variations;
    if (body.variations) {
      try {
        variations = JSON.parse(body.variations);
      } catch (error) {
        throw new BadRequestException(
          await this.i18n.translate('invalid_variations', lang),
        );
      }
    }

    const dto: CreateProductDto = {
      ...body,
      specifications,
      attributes,
      variations,
    };

    const result = await this.productService.create(dto, files, user, lang);
    return { message: result.message, data: result.data };
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.UPDATE, 'products')
  @UseInterceptors(FilesInterceptor('images'))
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    let specifications;
    if (body.specifications) {
      try {
        specifications = JSON.parse(body.specifications);
      } catch (error) {
        throw new BadRequestException(
          await this.i18n.translate('invalid_specifications', lang),
        );
      }
    }

    let attributes;
    if (body.attributes) {
      try {
        attributes = JSON.parse(body.attributes);
      } catch (error) {
        throw new BadRequestException(
          await this.i18n.translate('invalid_attributes', lang),
        );
      }
    }

    let variations;
    if (body.variations) {
      try {
        variations = JSON.parse(body.variations);
      } catch (error) {
        throw new BadRequestException(
          await this.i18n.translate('invalid_variations', lang),
        );
      }
    }

    const dto: CreateProductDto = {
      ...body,
      specifications,
      attributes,
      variations,
    };

    const result = await this.productService.update(id, dto, user, files, lang);
    return { message: result.message, data: result.data };
  }

  @Post('admin')
  @UseGuards(AuthentificationGuard, CompanyPermissionsGuard)
  @AuditAction(ActionType.CREATE, 'products')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(FilesInterceptor('images', 30))
  async createProduct(
    @Req() req: Request,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    if (!files || files.length < 1 || files.length > 30) {
      throw new BadRequestException(
        await this.i18n.translate('image_count_invalid', lang),
      );
    }

    let specifications;
    if (body.specifications) {
      try {
        specifications = JSON.parse(body.specifications);
      } catch (error) {
        throw new BadRequestException(
          await this.i18n.translate('invalid_specifications', lang),
        );
      }
    }

    let attributes;
    if (body.attributes) {
      try {
        attributes = JSON.parse(body.attributes);
      } catch (error) {
        throw new BadRequestException(
          await this.i18n.translate('invalid_attributes', lang),
        );
      }
    }

    let variations;
    if (body.variations) {
      try {
        variations = JSON.parse(body.variations);
      } catch (error) {
        throw new BadRequestException(
          await this.i18n.translate('invalid_variations', lang),
        );
      }
    }

    const dto: CreateProductAdminDto = {
      ...body,
      specifications,
      attributes,
      variations,
    };

    const result = await this.productService.createProduct(dto, files, user, lang);
    return { message: result.message, data: result.data };
  }

  @Patch('/admin/:id')
  @UseGuards(AuthentificationGuard, CompanyPermissionsGuard)
  @Permissions({ resource: 'PRODUCTS', action: 'canUpdate' })
  @AuditAction(ActionType.UPDATE, 'products')
  @UseInterceptors(FilesInterceptor('images', 5))
  async updateProduct(
    @Req() req: Request,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    let specifications;
    if (body.specifications) {
      try {
        specifications = JSON.parse(body.specifications);
      } catch (error) {
        throw new BadRequestException(
          await this.i18n.translate('invalid_specifications', lang),
        );
      }
    }

    let attributes;
    if (body.attributes) {
      try {
        attributes = JSON.parse(body.attributes);
      } catch (error) {
        throw new BadRequestException(
          await this.i18n.translate('invalid_attributes', lang),
        );
      }
    }

    let variations;
    if (body.variations) {
      try {
        variations = JSON.parse(body.variations);
      } catch (error) {
        throw new BadRequestException(
          await this.i18n.translate('invalid_variations', lang),
        );
      }
    }

    const dto: CreateProductAdminDto = {
      ...body,
      specifications,
      attributes,
      variations,
    };

    const result = await this.productService.updateProduct(id, dto, files, user, lang);
    return { message: result.message, data: result.data };
  }

  @Patch(':id/status')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.UPDATE, 'products')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateProductStatusDto,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    return this.productService.updateStatus(id, dto, user, lang);
  }

  @Get('one/:id')
  async getProductById(@Req() req: Request, @Param('id') id: string): Promise<{ message: string; data: Product }> {
    const lang = this.extractLanguage(req);
    return this.productService.findOne(id, lang);
  }

  @Get('one/slug/:slug')
  async getProductBySlug(@Req() req: Request, @Param('slug') slug: string): Promise<{ message: string; data: Product }> {
    const lang = this.extractLanguage(req);
    return this.productService.findOneBySlug(slug, lang);
  }

  @Get()
  @UseGuards(AuthentificationGuard, CompanyPermissionsGuard)
  async getProductsByType(
    @Req() req: Request,
    @Query() query: FindProductsQueryDto,
    @CurrentUser() user: UserEntity,
  ): Promise<{ message: string; data: PaginatedResponseDto<Product> }> {
    const lang = this.extractLanguage(req);
    return this.productService.findByType(
      user,
      query.type,
      query.search,
      query.page,
      query.limit,
      lang,
    );
  }

  @Get('published')
  @Public()
  async getProductsPublishedByType(
    @Req() req: Request,
    @Query('type') type?: string,
    @Query('brandId') brandId?: string,
    @Query('shopType') shopType?: string,
    @Query('fuelType') fuelType?: string,
    @Query('transmission') transmission?: string,
    @Query('typecar') typecar?: string,
    @Query('year') year?: string,
    @Query('yearStart') yearStart?: string,
    @Query('yearEnd') yearEnd?: string,
    @Query('companyId') companyId?: string,
    @Query('minDailyRate') minDailyRate?: string,
    @Query('maxDailyRate') maxDailyRate?: string,
    @Query('minSalePrice') minSalePrice?: string,
    @Query('maxSalePrice') maxSalePrice?: string,
    @Query('cityId') cityId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('countryId') countryId?: string,
  ): Promise<{ message: string; data: Product[] }> {
    const lang = this.extractLanguage(req);

    const filters = {
      brandId,
      shopType,
      fuelType,
      transmission,
      typecar,
      year,
      yearStart: yearStart ? Number(yearStart) : undefined,
      yearEnd: yearEnd ? Number(yearEnd) : undefined,
      companyId,
      minDailyRate: minDailyRate ? Number(minDailyRate) : undefined,
      maxDailyRate: maxDailyRate ? Number(maxDailyRate) : undefined,
      minSalePrice: minSalePrice ? Number(minSalePrice) : undefined,
      maxSalePrice: maxSalePrice ? Number(maxSalePrice) : undefined,
      cityId,
      categoryId,
      countryId,
    };

    return this.productService.findProductPublishedByType(type, lang, filters);
  }

  @Get('published/public')
  @Public()
  async getPublishedProducts(
    @Req() req: Request,
    @Query('type') type?: string,
    @Query('companyId') companyId?: string,
    @Query('shopType') shopType?: string,
    @Query('fuelType') fuelType?: FuelType,
    @Query('transmission') transmission?: Transmission,
    @Query('typecar') typecar?: Type_rental_both_sale_car,
    @Query('minDailyRate') minDailyRate?: string,
    @Query('maxDailyRate') maxDailyRate?: string,
    @Query('minSalePrice') minSalePrice?: string,
    @Query('maxSalePrice') maxSalePrice?: string,
    @Query('countryId') countryId?: string,
    @Query('cityId') cityId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const lang = this.extractLanguage(req);
    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.max(Number(limit) || 10, 1);

    return this.productService.findProductPublishedByTypeByCompany(
      type || undefined,
      companyId || undefined,
      shopType || undefined,
      fuelType || undefined,
      transmission || undefined,
      typecar || undefined,
      minDailyRate !== undefined ? Number(minDailyRate) : undefined,
      maxDailyRate !== undefined ? Number(maxDailyRate) : undefined,
      minSalePrice !== undefined ? Number(minSalePrice) : undefined,
      maxSalePrice !== undefined ? Number(maxSalePrice) : undefined,
      countryId || undefined,
      cityId || undefined,
      categoryId || undefined,
      pageNum,
      limitNum,
      lang,
    );
  }

  @Get('published/public/bycategory')
  @Public()
  async getPublishedProductByCategory(
    @Req() req: Request,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
    @Query('shopType') shopType?: string,
    @Query('fuelType') fuelType?: string,
    @Query('transmission') transmission?: string,
    @Query('typecar') typecar?: string,
    @Query('year') year?: string,
    @Query('yearStart') yearStart?: string,
    @Query('yearEnd') yearEnd?: string,
    @Query('type') type?: string,
    @Query('companyId') companyId?: string,
    @Query('minDailyRate') minDailyRate?: string,
    @Query('maxDailyRate') maxDailyRate?: string,
    @Query('minSalePrice') minSalePrice?: string,
    @Query('maxSalePrice') maxSalePrice?: string,
    @Query('cityId') cityId?: string,
    @Query('countryId') countryId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const lang = this.extractLanguage(req);
    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.max(Number(limit) || 10, 1);

    const fuelTypeEnum =
      fuelType && Object.values(FuelType).includes(fuelType as FuelType)
        ? (fuelType as FuelType)
        : undefined;

    const transmissionEnum =
      transmission &&
        Object.values(Transmission).includes(transmission as Transmission)
        ? (transmission as Transmission)
        : undefined;

    const typecarEnum =
      typecar &&
        Object.values(Type_rental_both_sale_car).includes(
          typecar as Type_rental_both_sale_car,
        )
        ? (typecar as Type_rental_both_sale_car)
        : undefined;

    const yearStartNum = yearStart ? Number(yearStart) : undefined;
    const yearEndNum = yearEnd ? Number(yearEnd) : undefined;

    return this.productService.findProductPublishedByCategory(
      categoryId,
      brandId,
      shopType,
      fuelTypeEnum,
      transmissionEnum,
      typecarEnum,
      year,
      yearStartNum,
      yearEndNum,
      type,
      companyId,
      minDailyRate ? Number(minDailyRate) : undefined,
      maxDailyRate ? Number(maxDailyRate) : undefined,
      minSalePrice ? Number(minSalePrice) : undefined,
      maxSalePrice ? Number(maxSalePrice) : undefined,
      cityId,
      countryId,
      pageNum,
      limitNum,
      lang,
    );
  }

  @Get('group-by-type')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.VIEW, 'products')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  async groupByType(@Req() req: Request): Promise<Record<string, Product[]>> {
    const lang = this.extractLanguage(req);
    return this.productService.groupByType(lang);
  }

  @Get('group-by-type_first')
  @Public()
  async groupByType_first(@Req() req: Request): Promise<Record<string, Product>> {
    const lang = this.extractLanguage(req);
    return this.productService.groupByType_First_Product(lang);
  }

  @Get('/category')
  @Public()
  async getGroupedProductsByCategory(
    @Req() req: Request,
    @Query('categoryId') categoryId?: string,
    @CurrentUser() user?: UserEntity,
  ): Promise<{
    data: (CategoryEntity & { products: Product[] })[];
  }> {
    const lang = this.extractLanguage(req);
    console.log('User connecté (si existe)', user);
    return this.productService.findAllGroupedByCategory(categoryId, lang);
  }

  @Get('by-active-company')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'products')
  async getProductsByActiveCompany(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ): Promise<{
    message: string;
    data: {
      data: any[];
      total: number;
      page: number;
      limit: number;
    };
  }> {
    const lang = this.extractLanguage(req);
    const result = await this.productService.findByActiveCompanyForUser(
      user,
      Number(page),
      Number(limit),
      lang,
    );
    return result;
  }

  @Get('search')
  @Public()
  async search(
    @Req() req: Request,
    @Query('search') query: string,
  ): Promise<{ message: string; data: Product[] }> {
    const lang = this.extractLanguage(req);
    return this.productService.searchProducts(query, lang);
  }

  @Get('best-selling')
  async getBestSellingProducts(
    @Req() req: Request,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('type') type?: string,
    @Query('countryId') countryId?: string,
    @Query('cityId') cityId?: string,
  ) {
    const lang = this.extractLanguage(req);
    const currentPage = page ? Number(page) : 1;
    const currentLimit = limit ? Number(limit) : 5;
    const shopType = type || CompanyType.SHOP;

    const result = await this.productService.getBestSellingProducts(
      currentPage,
      currentLimit,
      shopType,
      lang,
      countryId,
      cityId,
    );

    return {
      message: result.message,
      data: result.data,
    };
  }
  
  @Post('/add/new/wishlist')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'products')
  async addToWishlist(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Body() dto: CreateWishlistDto,
  ) {
    const lang = this.extractLanguage(req);
    return this.productService.addToWishlist(user, dto, lang);
  }

  @Get('/get/wishlist')
  @UseGuards(AuthentificationGuard)
  async getUserWishlist(@Req() req: Request, @CurrentUser() user: UserEntity) {
    const lang = this.extractLanguage(req);
    return this.productService.getUserWishlist(user, lang);
  }

  @Delete(':productId/wishlist/delete')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'products')
  async removeFromWishlist(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('productId') productId: string,
  ) {
    const lang = this.extractLanguage(req);
    return this.productService.removeFromWishlist(user, productId, lang);
  }

  @Get('search/all')
  async searchAll(
    @Req() req: Request,
    @Query('keyword') keyword?: string,
    @Query('type') type?: CompanyType,
    @Query('countryId') countryId?: string,  // Ajout
    @Query('cityId') cityId?: string,        // Ajout
  ) {
    const lang = this.extractLanguage(req);
    return this.productService.search(keyword, type, lang, countryId, cityId);
  }

  @Post('brand')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'brands')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @UseInterceptors(FileInterceptor('image'))
  async createBrand(
    @Req() req: Request,
    @Body() body: CreateBrandDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const lang = this.extractLanguage(req);
    if (!file) {
      throw new BadRequestException(
        await this.i18n.translate('image_required', lang),
      );
    }
    return await this.productService.createBrand(body, file, lang);
  }

  @Patch('brand/:id')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'brands')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @UseInterceptors(FileInterceptor('image'))
  async updateBrand(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const lang = this.extractLanguage(req);
    return await this.productService.updateBrand(id, body, file, lang);
  }

  @Get('brand')
  async findAllBrand(@Req() req: Request, @Query('type') type?: string) {
    const lang = this.extractLanguage(req);
    return this.productService.findAllBrand(type, lang);
  }

  @Get('/brand/:id')
  async findOneBrand(@Req() req: Request, @Param('id') id: string) {
    const lang = this.extractLanguage(req);
    return this.productService.findOneBrand(id, lang);
  }

  @Delete('/image/delete')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.DELETE, 'products')
  async deleteFiles(
    @Req() req: Request,
    @Body('fileUrls') fileUrls: string | string[],
  ) {
    const lang = this.extractLanguage(req);
    if (!fileUrls) {
      throw new BadRequestException(
        await this.i18n.translate('image_required', lang),
      );
    }
    const result = await this.productService.deleteFromCloudinary(fileUrls, lang);
    return result;
  }

  @Patch('/image/update')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'products')
  async updateImage(
    @Req() req: Request,
    @Body('id') productId: string,
    @Body('url') imageUrl: string,
  ) {
    const lang = this.extractLanguage(req);
    const updatedProduct = await this.productService.updateProductImage(
      productId,
      imageUrl,
      lang,
    );
    return {
      message: await this.i18n.translate('image_updated', lang),
      data: updatedProduct,
    };
  }
}