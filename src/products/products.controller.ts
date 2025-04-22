import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, UseGuards, ValidationPipe, UsePipes, UseInterceptors, UploadedFiles, ClassSerializerInterceptor, Query } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { Product } from './entities/product.entity';
import { ProductService } from './products.service';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CategoryEntity } from 'src/category/entities/category.entity';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) { }
  @UseInterceptors(ClassSerializerInterceptor)
  @Post()
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(FilesInterceptor('images', 10)) // plusieurs fichiers
  async create(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateProductDto,
  ) {
    return this.productService.create(dto, files);
  }

  // Récupérer un produit par ID
  @Get('one/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return this.productService.findOne(id);
  }

  // Mise à jour d'un produit
  @Patch(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(ClassSerializerInterceptor)
  @UseInterceptors(
    FilesInterceptor('images', 10), // Jusqu'à 10 fichiers d’un coup
  )
  async update(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateProductDto,
  ): Promise<Product> {
    return this.productService.update(id, dto, files);
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
