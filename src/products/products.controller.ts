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
  ClassSerializerInterceptor,
  Query,
  BadRequestException,
  Delete,
  UploadedFile,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { Product } from './entities/product.entity';
import { ProductService } from './products.service';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import {
  AnyFilesInterceptor,
  FileInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
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
import { UpdateBrandDto } from './dto/update-brand.dto';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(FilesInterceptor('images', 30))
  async create(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @CurrentUser() user: UserEntity,
  ) {
    if (!files || files.length < 1 || files.length > 30) {
      throw new BadRequestException("Le nombre d'images doit être compris entre 1 et 30");
    }

    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active trouvée pour cet utilisateur');
    }

    // 🔹 Parse specifications si fournies
    let specifications;
    if (body.specifications) {
      try {
        specifications = JSON.parse(body.specifications);
      } catch (error) {
        throw new BadRequestException('Le champ specifications doit être un JSON valide');
      }
    }

    // 🔹 Parse attributes si fournies
    let attributes;
    if (body.attributes) {
      try {
        attributes = JSON.parse(body.attributes);
      } catch (error) {
        throw new BadRequestException('Le champ attributes doit être un JSON valide');
      }
    }

    // 🔹 Parse variations si fournies - NOUVEAU
    let variations;
    if (body.variations) {
      try {
        variations = JSON.parse(body.variations);
      } catch (error) {
        throw new BadRequestException('Le champ variations doit être un JSON valide');
      }
    }

    const dto: CreateProductDto = {
      ...body,
      specifications,
      attributes,
      variations, // ✅ Ajouter les variations au DTO
    };

    const result = await this.productService.create(dto, files, user);
    return { message: result.message, data: result.data };
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UseInterceptors(FilesInterceptor('images'))
  async update(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @CurrentUser() user: UserEntity,
  ) {
    // 🔹 Parse specifications si fournies
    let specifications;
    if (body.specifications) {
      try {
        specifications = JSON.parse(body.specifications);
      } catch (error) {
        throw new BadRequestException('Le champ specifications doit être un JSON valide');
      }
    }

    // 🔹 Parse attributes si fournies
    let attributes;
    if (body.attributes) {
      try {
        attributes = JSON.parse(body.attributes);
      } catch (error) {
        throw new BadRequestException('Le champ attributes doit être un JSON valide');
      }
    }

    // 🔹 Parse variations si fournies - NOUVEAU
    let variations;
    if (body.variations) {
      try {
        variations = JSON.parse(body.variations);
      } catch (error) {
        throw new BadRequestException('Le champ variations doit être un JSON valide');
      }
    }

    const dto: CreateProductDto = {
      ...body,
      specifications,
      attributes,
      variations, // ✅ Ajouter les variations au DTO
    };

    const result = await this.productService.update(id, dto, user, files);
    return { message: result.message, data: result.data };
  }

  @Post('admin')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(FilesInterceptor('images', 30))
  async createProduct(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @CurrentUser() user: UserEntity,
  ) {
    if (!files || files.length < 1 || files.length > 30) {
      throw new BadRequestException("Le nombre d'images doit être compris entre 1 et 30");
    }
    // 🔹 Parse specifications si fournies
    let specifications;
    if (body.specifications) {
      try {
        specifications = JSON.parse(body.specifications);
      } catch (error) {
        throw new BadRequestException('Le champ specifications doit être un JSON valide');
      }
    }

    // 🔹 Parse attributes si fournies
    let attributes;
    if (body.attributes) {
      try {
        attributes = JSON.parse(body.attributes);
      } catch (error) {
        throw new BadRequestException('Le champ attributes doit être un JSON valide');
      }
    }

    // 🔹 Parse variations si fournies - NOUVEAU
    let variations;
    if (body.variations) {
      try {
        variations = JSON.parse(body.variations);
      } catch (error) {
        throw new BadRequestException('Le champ variations doit être un JSON valide');
      }
    }

    const dto: CreateProductAdminDto = {
      ...body,
      specifications,
      attributes,
      variations,
    };

    const result = await this.productService.createProduct(dto, files, user);
    return { message: result.message, data: result.data };
  }

  @Patch('/admin/:id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UseInterceptors(FilesInterceptor('images', 5))
  async updateProduct(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
  ) {
    // 🔹 Parse specifications si fournies
    let specifications;
    if (body.specifications) {
      try {
        specifications = JSON.parse(body.specifications);
      } catch (error) {
        throw new BadRequestException('Le champ specifications doit être un JSON valide');
      }
    }

    // 🔹 Parse attributes si fournies
    let attributes;
    if (body.attributes) {
      try {
        attributes = JSON.parse(body.attributes);
      } catch (error) {
        throw new BadRequestException('Le champ attributes doit être un JSON valide');
      }
    }

    // 🔹 Parse variations si fournies - NOUVEAU
    let variations;
    if (body.variations) {
      try {
        variations = JSON.parse(body.variations);
      } catch (error) {
        throw new BadRequestException('Le champ variations doit être un JSON valide');
      }
    }

    const dto: CreateProductAdminDto = {
      ...body,
      specifications,
      attributes,
      variations, // ✅ Ajouter les variations au DTO
    };

    const result = await this.productService.updateProduct(id, dto, files);
    return { message: result.message, data: result.data };
  }

  @Patch(':id/status')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateProductStatusDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.productService.updateStatus(id, dto, user);
  }

  // Récupérer un produit par ID
  @Get('one/:id')
  async getProductById(@Param('id') id: string): Promise<{ message: string; data: Product }> {
    return this.productService.findOne(id);
  }

  @Get()
  @Public()
  async getProductsByType(
    @Query('type') type?: string,
  ): Promise<{ message: string; data: Product[] }> {
    return this.productService.findByType(type);
  }

  @Get('published')
  @Public()
  async getProductsPublishedByType(
    @Query('type') type?: string,
  ): Promise<{ message: string; data: Product[] }> {
    return this.productService.findProductPublishedByType(type);
  }

  @Get('published/public')
  @Public()
  async getPublishedProducts(
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
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
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
      pageNum,
      limitNum,
    );
  }

  @Get('published/public/bycategory')
  @Public()
  async getPublishedProductByCategory(
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
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.max(Number(limit) || 10, 1);

    // Cast enums
    const fuelTypeEnum =
      fuelType && Object.values(FuelType).includes(fuelType as FuelType)
        ? (fuelType as FuelType)
        : undefined;

    const transmissionEnum =
      transmission && Object.values(Transmission).includes(transmission as Transmission)
        ? (transmission as Transmission)
        : undefined;

    const typecarEnum =
      typecar &&
      Object.values(Type_rental_both_sale_car).includes(typecar as Type_rental_both_sale_car)
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
      pageNum,
      limitNum,
    );
  }

  @Get('group-by-type')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  async groupByType(): Promise<Record<string, Product[]>> {
    return this.productService.groupByType();
  }

  @Get('group-by-type_first')
  @Public()
  async groupByType_first(): Promise<Record<string, Product>> {
    return this.productService.groupByType_First_Product();
  }

  @Get('/category')
  @Public()
  async getGroupedProductsByCategory(
    @Query('categoryId') categoryId?: string,
    @CurrentUser() user?: UserEntity,
  ): Promise<{
    data: (CategoryEntity & { products: Product[] })[];
  }> {
    console.log('User connecté (si existe)', user);
    return this.productService.findAllGroupedByCategory(categoryId);
  }

  @Get('by-active-company')
  @UseGuards(AuthentificationGuard)
  async getProductsByActiveCompany(
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
    const result = await this.productService.findByActiveCompanyForUser(
      user,
      Number(page),
      Number(limit),
    );

    return result;
  }

  @Get('search')
  @Public()
  async search(@Query('search') query: string): Promise<{ message: string; data: Product[] }> {
    return this.productService.searchProducts(query);
  }

  @Get('best-selling')
  async getBestSellingProducts(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('type') type?: string,
  ) {
    const currentPage = page ? Number(page) : 1;
    const currentLimit = limit ? Number(limit) : 5;
    const shopType = type || CompanyType.SHOP;

    const result = await this.productService.getBestSellingProducts(
      currentPage,
      currentLimit,
      shopType,
    );

    return {
      message: result.message,
      data: result.data,
    };
  }

  @Post('/add/new/wishlist')
  @UseGuards(AuthentificationGuard)
  async addToWishlist(@CurrentUser() user: UserEntity, @Body() dto: CreateWishlistDto) {
    return this.productService.addToWishlist(user, dto);
  }

  @Get('/get/wishlist')
  @UseGuards(AuthentificationGuard)
  async getUserWishlist(@CurrentUser() user: UserEntity) {
    return this.productService.getUserWishlist(user);
  }

  @Delete(':productId/wishlist/delete')
  @UseGuards(AuthentificationGuard)
  async removeFromWishlist(
    @CurrentUser() user: UserEntity,
    @Param('productId') productId: string,
  ) {
    return this.productService.removeFromWishlist(user, productId);
  }

  @Get('search/all')
  async searchAll(@Query('keyword') keyword?: string, @Query('type') type?: CompanyType) {
    return this.productService.search(keyword, type);
  }

  @Post('brand')
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @UseInterceptors(FileInterceptor('image'))
  async createBrand(@Body() body: CreateBrandDto, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Une image est requise pour créer une marque.');
    }

    return await this.productService.createBrand(body, file);
  }

  @Patch('brand/:id')
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @UseInterceptors(FileInterceptor('image'))
  async updateBrand(
    @Param('id') id: string,
    @Body() body: any, // JSON envoyé dans Postman
    @UploadedFile() file?: Express.Multer.File, // fichier optionnel
  ) {
    return await this.productService.updateBrand(id, body, file);
  }

  @Get('brand')
  findAllBrand(@Query('type') type?: string) {
    return this.productService.findAllBrand(type);
  }

  @Get('/brand/:id')
  findOneBrand(@Param('id') id: string) {
    return this.productService.findOneBrand(id);
  }

  @Delete('/image/delete')
  async deleteFiles(@Body('fileUrls') fileUrls: string | string[]) {
    if (!fileUrls) {
      throw new BadRequestException('Au moins un fichier est requis.');
    }

    const result = await this.productService.deleteFromCloudinary(fileUrls);
    return result;
  }

  @Patch('/image/update')
  async updateImage(@Body('id') productId: string, @Body('url') imageUrl: string) {
    const updatedProduct = await this.productService.updateProductImage(productId, imageUrl);
    return {
      message: 'Image du produit mise à jour avec succès',
      data: updatedProduct,
    };
  }
}
