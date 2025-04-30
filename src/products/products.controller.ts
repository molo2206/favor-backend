import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, UseGuards, ValidationPipe, UsePipes, UseInterceptors, UploadedFiles, ClassSerializerInterceptor, Query, BadRequestException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { Product } from './entities/product.entity';
import { ProductService } from './products.service';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { CurrentUser } from '../users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) { }
  @UseInterceptors(ClassSerializerInterceptor)
  @Post()
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(FilesInterceptor('images', 10))
  async create(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateProductDto,
    @CurrentUser() user: UserEntity,
  ) {
    // Ajoutez un log pour vérifier l'entreprise active
    console.log('Entreprise active de l\'utilisateur :', user.activeCompany);
  
    // Vérifiez si l'utilisateur a une entreprise active
    if (!user.activeCompanyId) {
      throw new BadRequestException('Aucune entreprise active trouvée pour cet utilisateur');
    }
  
    const result = await this.productService.create(dto, files, user);
    return {
      message: result.message,
      data: result.data,
    };
  }


  @Patch(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(ClassSerializerInterceptor)
  @UseInterceptors(FilesInterceptor('images', 10))
  async update(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateProductDto,
    @CurrentUser() user: UserEntity,
  ) {
    const result = await this.productService.update(id, dto, files, user);
    return {
      message: result.message,
      data: result.data,
    };
  }


  // Récupérer un produit par ID
  @Get('one/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return this.productService.findOne(id);
  }



  @Get()
  async getProductsByType(@Query('type') type?: string): Promise<Product[]> {
    return this.productService.findByType(type);
  }

  @Get('group-by-type')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  async groupByType(): Promise<Record<string, Product[]>> {
    return this.productService.groupByType();
  }

  @Get('group-by-type_first')
  async groupByType_first(): Promise<Record<string, Product>> {
    return this.productService.groupByType_First_Product();
  }

  @Get('/category')
  async getGroupedProductsByCategory(
    @Query('categoryId') categoryId?: string,
  ): Promise<{
    data: (CategoryEntity & { products: Product[] })[];
  }> {
    return this.productService.findAllGroupedByCategory(categoryId);
  }

  @Get('company/:companyId')
  async getProductsByCompany(
    @Param('companyId') companyId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ data: any }> {
    const result = await this.productService.findByCompany(companyId);
    return { data: result };
  }

  @Get('search')
  async search(@Query('search') search: string) {
    return this.productService.searchProducts(search);
  }

  // Supprimer un produit
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.productService.remove(id);
  }
}
