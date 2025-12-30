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
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { UserRole } from 'src/users/enum/user-role-enum';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize.roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { CategoryEntity } from './entities/category.entity';

@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @Body() body: any, // on parse manuellement les JSON
    @UploadedFile() file: Express.Multer.File,
  ) {
    // 🔹 Parse les specifications si fournies
    let specifications;
    if (body.specifications) {
      try {
        specifications = JSON.parse(body.specifications);
      } catch (error) {
        throw new BadRequestException('Le champ specifications doit être un JSON valide');
      }
    }

    // 🔹 Parse les attributs si fournis
    let attributes;
    if (body.attributes) {
      try {
        attributes = JSON.parse(body.attributes);
      } catch (error) {
        throw new BadRequestException('Le champ attributes doit être un JSON valide');
      }
    }

    const createCategoryDto: CreateCategoryDto = {
      name: body.name,
      parentId: body.parentId,
      type: body.type,
      color: body.color,
      specifications, // undefined si non fourni
      attributes, // undefined si non fourni
    };

    return await this.categoryService.create(createCategoryDto, file);
  }

  @Get()
  async findAll(
    @Query('type') type?: string, // type est un paramètre de requête
  ): Promise<{ data: CategoryEntity[] }> {
    // Retourne un objet avec "data" contenant un tableau
    const categories = await this.categoryService.findAll(type);
    return { data: categories }; // Encapsule le tableau de catégories dans "data"
  }

  @Get('with-products')
  async findAllWithProducts(
    @Query('companyId') companyId: string,
    @Query('type') type?: string,
  ) {
    return this.categoryService.findAllWithProducts(companyId, type);
  }

  @Get('parents')
  async findAllParents(@Query('type') type?: string): Promise<{ data: CategoryEntity[] }> {
    const categories = await this.categoryService.findAllParent(type);
    return { data: categories };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<{ data: CategoryEntity }> {
    // Retourne un objet avec "data"
    const category = await this.categoryService.findOne(id);
    return { data: category }; // Retourne la catégorie encapsulée dans "data"
  }

  // Mettre à jour une catégorie existante
  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @UseInterceptors(FileInterceptor('image'))
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ message: string; data: CategoryEntity }> {
    // 🔹 Parse specifications
    let specifications;
    if (body.specifications) {
      try {
        specifications = JSON.parse(body.specifications);
        if (!Array.isArray(specifications)) {
          throw new BadRequestException('Le champ specifications doit être un tableau JSON');
        }
      } catch (error) {
        throw new BadRequestException('Le champ specifications doit être un JSON valide');
      }
    }

    // 🔹 Parse attributes
    let attributes;
    if (body.attributes) {
      try {
        attributes = JSON.parse(body.attributes);
        if (!Array.isArray(attributes)) {
          throw new BadRequestException('Le champ attributes doit être un tableau JSON');
        }
      } catch (error) {
        throw new BadRequestException('Le champ attributes doit être un JSON valide');
      }
    }

    const updateCategoryDto: UpdateCategoryDto = {
      name: body.name,
      parentId: body.parentId,
      type: body.type,
      color: body.color,
      specifications, // undefined si non fourni
      attributes, // undefined si non fourni
    };

    return await this.categoryService.update(id, updateCategoryDto, file);
  }

  @Get('/by-type/:type')
  async findByTypeCompany(@Param('type') type: string): Promise<{ data: CategoryEntity[] }> {
    const categories = await this.categoryService.findByTypeCompany(type);
    return { data: categories };
  }

  @Get('parent/:parentId')
  async getCategoriesByParentId(
    @Param('parentId') parentId: string,
  ): Promise<{ message: string; data: CategoryEntity[] }> {
    const parent = parentId === 'null' ? null : parentId;

    // Appel de la méthode pour obtenir les catégories par parentId sans pagination
    const categories = await this.categoryService.findByParentId(parent);

    return {
      message: `Catégories récupérées avec succès pour le parent : ${parent ?? 'null'}.`,
      data: categories,
    };
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ data: string }> {
    await this.categoryService.remove(id);
    return { data: `Category with id ${id} removed successfully` };
  }

  @Get(':id/specifications/by-category')
  async getSpecificationsByCategory(@Param('id') id: string) {
    return this.categoryService.getSpecificationsByCategoryId(id);
  }

  @Get(':categoryId/attributes/by-category')
  findAttributesByCategory(@Param('categoryId') categoryId: string) {
    return this.categoryService.getAttributesByCategoryId(categoryId);
  }

  @Delete(':id')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteCategory(@Param('id') id: string) {
    return this.categoryService.deleteCategory(id);
  }
}
