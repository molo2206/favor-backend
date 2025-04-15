import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, UseGuards, ValidationPipe, UsePipes, UseInterceptors, UploadedFile } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { Product } from './entities/product.entity';
import { ProductService } from './products.service';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) { }
  @Post()
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads/product',
        filename: (req, file, cb) => {
          const uniqueName = `${Date.now()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
    }),
  )
  async create(
    @UploadedFile() image: Express.Multer.File,
    @Body() dto: CreateProductDto,
  ) {
    const imagePath = image ? `/uploads/product/${image.filename}` : undefined;
    return this.productService.create(dto, imagePath);
  }
  // Récupérer tous les produits
  @Get()
  findAll(): Promise<Product[]> {
    return this.productService.findAll();
  }

  // Récupérer un produit par ID
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return this.productService.findOne(id);
  }

  // Mise à jour d'un produit
  @Patch(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads/product',
        filename: (req, file, cb) => {
          const uniqueName = `${Date.now()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
    }),
  )
  async update(
    @Param('id') id: string,
    @UploadedFile() image: Express.Multer.File,
    @Body() dto: CreateProductDto,
  ): Promise<Product> {
    const imagePath = image ? `/uploads/product/${image.filename}` : undefined;
    return this.productService.update(id, dto, imagePath);
  }

  @Get('type/:type')
  async getProductsByType(@Param('type') type: string): Promise<Product[]> {
    return this.productService.findByType(type);
  }

  @Get('group-by-type')
  async groupByType(): Promise<Record<string, Product[]>> {
    return this.productService.groupByType();
  }

  // Supprimer un produit
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.productService.remove(id);
  }
}
