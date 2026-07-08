/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UsePipes,
  ValidationPipe,
  UseInterceptors,
  UploadedFile,
  Query,
  BadRequestException,
  HttpCode,
  HttpStatus,
  ParseFilePipe,
  MaxFileSizeValidator,
  Logger,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { UserRole } from 'src/users/enum/user-role-enum';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize.roles.decorator';
import { CategoryEntity } from './entities/category.entity';
import { ImageFileValidator } from 'src/files/common/utils/image-file.validator';
import { Request } from 'express';

// Configuration Multer (inchangée)
const multerConfig = {
  storage: diskStorage({
    destination: './temp',
    filename: (req, file, callback) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = extname(file.originalname);
      const filename = `${uniqueSuffix}${ext}`;
      callback(null, filename);
    },
  }),
  fileFilter: (req, file, callback) => {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(
        new BadRequestException(
          `Type de fichier non supporté: ${file.mimetype}. Types acceptés: ${allowedMimes.join(', ')}`,
        ),
        false,
      );
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
};

@Controller('category')
export class CategoryController {
  private readonly logger = new Logger(CategoryController.name);

  constructor(private readonly categoryService: CategoryService) { }

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'fr';
    const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
    const supported = ['fr', 'en', 'sw', 'es','ar'];
    return supported.includes(primary) ? primary : 'fr';
  }

  @Post()
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @UseInterceptors(FileInterceptor('image', multerConfig))
  async create(
    @Req() req: Request,
    @Body() body: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new ImageFileValidator([
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp',
            'image/gif',
          ]),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    const lang = this.extractLanguage(req);
    this.logger.log('=== CREATING CATEGORY ===');
    this.logger.log(`Body received: ${JSON.stringify(body, null, 2)}`);
    this.logger.log(
      `File received: ${file ? `${file.originalname} (${file.mimetype}, ${file.size} bytes)` : 'No file'}`,
    );

    if (!file) {
      throw new BadRequestException(
        await this.categoryService['translate']('category.error.image_required', lang),
      );
    }
    if (!body.name) {
      throw new BadRequestException('Le champ name est requis');
    }
    if (!body.type) {
      throw new BadRequestException('Le champ type est requis');
    }

    let specifications;
    if (body.specifications) {
      try {
        specifications =
          typeof body.specifications === 'string'
            ? JSON.parse(body.specifications)
            : body.specifications;
        if (!Array.isArray(specifications)) {
          throw new BadRequestException(
            'Le champ specifications doit être un tableau',
          );
        }
      } catch (error) {
        throw new BadRequestException(
          'Le champ specifications doit être un JSON valide',
        );
      }
    }

    let attributes;
    if (body.attributes) {
      try {
        attributes =
          typeof body.attributes === 'string'
            ? JSON.parse(body.attributes)
            : body.attributes;
        if (!Array.isArray(attributes)) {
          throw new BadRequestException(
            'Le champ attributes doit être un tableau',
          );
        }
      } catch (error) {
        throw new BadRequestException(
          'Le champ attributes doit être un JSON valide',
        );
      }
    }

    const createCategoryDto: CreateCategoryDto = {
      name: body.name,
      parentId: body.parentId || null,
      type: body.type,
      color: body.color || null,
      specifications: specifications || [],
      attributes: attributes || [],
      maxPassengers: body.maxPassengers ? parseInt(body.maxPassengers) : 0,
      price: body.price ? parseFloat(body.price) : undefined,
    };

    this.logger.log(
      `CreateCategoryDto: ${JSON.stringify(createCategoryDto, null, 2)}`,
    );

    try {
      const result = await this.categoryService.create(createCategoryDto, file, lang);
      this.logger.log(`Category created successfully: ${result.data.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Error creating category: ${error.message}`);
      throw error;
    }
  }

  @Get()
  async findAll(@Req() req: Request, @Query('type') type?: string): Promise<{ data: CategoryEntity[] }> {
    const lang = this.extractLanguage(req);
    this.logger.log(`Fetching all categories${type ? ` with type: ${type}` : ''}`);
    const categories = await this.categoryService.findAll(type, lang);
    return { data: categories };
  }

  @Get('with-products')
  async findAllWithProducts(
    @Req() req: Request,
    @Query('companyId') companyId: string,
    @Query('type') type?: string,
  ) {
    const lang = this.extractLanguage(req);
    this.logger.log(`Fetching categories with products for company: ${companyId}`);
    return this.categoryService.findAllWithProducts(companyId, type, lang);
  }

  @Get('with-products-limit-ten')
  async findAllWithProductsLimitTen(
    @Req() req: Request,
    @Query('companyId') companyId?: string,
    @Query('type') type?: string,
  ) {
    const lang = this.extractLanguage(req);
    this.logger.log(`Fetching top 10 categories with products`);
    return this.categoryService.findAllWithProductsLimitTen(companyId, type, lang);
  }

  @Get('parents')
  async findAllParents(@Req() req: Request, @Query('type') type?: string): Promise<{ data: CategoryEntity[] }> {
    const lang = this.extractLanguage(req);
    this.logger.log(`Fetching parent categories${type ? ` with type: ${type}` : ''}`);
    const categories = await this.categoryService.findAllParent(type, lang);
    return { data: categories };
  }

  @Get(':id')
  async findOne(@Req() req: Request, @Param('id') id: string): Promise<{ data: CategoryEntity }> {
    const lang = this.extractLanguage(req);
    this.logger.log(`Fetching category with id: ${id}`);
    const category = await this.categoryService.findOne(id, lang);
    return { data: category };
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @UseInterceptors(FileInterceptor('image', multerConfig))
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new ImageFileValidator([
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp',
            'image/gif',
          ]),
        ],
        fileIsRequired: false,
      }),
    )
    file?: Express.Multer.File,
  ): Promise<{ message: string; data: CategoryEntity }> {
    const lang = this.extractLanguage(req);
    this.logger.log(`Updating category with id: ${id}`);
    this.logger.log(`Body received: ${JSON.stringify(body, null, 2)}`);
    this.logger.log(`File received: ${file ? `${file.originalname} (${file.mimetype})` : 'No file'}`);

    let specifications;
    if (body.specifications) {
      try {
        specifications =
          typeof body.specifications === 'string'
            ? JSON.parse(body.specifications)
            : body.specifications;
        if (!Array.isArray(specifications)) {
          throw new BadRequestException(
            'Le champ specifications doit être un tableau JSON',
          );
        }
      } catch (error) {
        throw new BadRequestException(
          'Le champ specifications doit être un JSON valide',
        );
      }
    }

    let attributes;
    if (body.attributes) {
      try {
        attributes =
          typeof body.attributes === 'string'
            ? JSON.parse(body.attributes)
            : body.attributes;
        if (!Array.isArray(attributes)) {
          throw new BadRequestException(
            'Le champ attributes doit être un tableau JSON',
          );
        }
      } catch (error) {
        throw new BadRequestException(
          'Le champ attributes doit être un JSON valide',
        );
      }
    }

    const updateCategoryDto: UpdateCategoryDto = {
      name: body.name,
      parentId: body.parentId,
      type: body.type,
      color: body.color,
      specifications,
      attributes,
      maxPassengers: body.maxPassengers ? parseInt(body.maxPassengers) : undefined,
      price: body.price ? parseFloat(body.price) : undefined,
    };

    try {
      const result = await this.categoryService.update(id, updateCategoryDto, file, lang);
      this.logger.log(`Category updated successfully: ${id}`);
      return result;
    } catch (error) {
      this.logger.error(`Error updating category: ${error.message}`);
      throw error;
    }
  }

  @Get('/by-type/:type')
  async findByTypeCompany(@Req() req: Request, @Param('type') type: string): Promise<{ data: CategoryEntity[] }> {
    const lang = this.extractLanguage(req);
    this.logger.log(`Fetching categories by type: ${type}`);
    const categories = await this.categoryService.findByTypeCompany(type, lang);
    return { data: categories };
  }

  @Get('parent/:parentId')
  async getCategoriesByParentId(@Req() req: Request, @Param('parentId') parentId: string): Promise<{ message: string; data: CategoryEntity[] }> {
    const lang = this.extractLanguage(req);
    const parent = parentId === 'null' ? null : parentId;
    this.logger.log(`Fetching categories by parent: ${parent}`);
    const categories = await this.categoryService.findByParentId(parent, lang);
    return {
      message: `Catégories récupérées avec succès pour le parent : ${parent ?? 'null'}.`,
      data: categories,
    };
  }

  @Delete(':id')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async remove(@Req() req: Request, @Param('id') id: string): Promise<{ data: string }> {
    const lang = this.extractLanguage(req);
    this.logger.log(`Removing category with id: ${id}`);
    await this.categoryService.remove(id, lang);
    return { data: `Category with id ${id} removed successfully` };
  }

  @Get(':id/specifications/by-category')
  async getSpecificationsByCategory(@Req() req: Request, @Param('id') id: string) {
    const lang = this.extractLanguage(req);
    this.logger.log(`Fetching specifications for category: ${id}`);
    return this.categoryService.getSpecificationsByCategoryId(id, lang);
  }

  @Get(':categoryId/attributes/by-category')
  async findAttributesByCategory(@Req() req: Request, @Param('categoryId') categoryId: string) {
    const lang = this.extractLanguage(req);
    this.logger.log(`Fetching attributes for category: ${categoryId}`);
    return this.categoryService.getAttributesByCategoryId(categoryId, lang);
  }

  @Delete(':id')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteCategory(@Req() req: Request, @Param('id') id: string) {
    const lang = this.extractLanguage(req);
    this.logger.log(`Soft deleting category with id: ${id}`);
    return this.categoryService.deleteCategory(id, lang);
  }
}