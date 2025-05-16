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
  constructor(private readonly categoryService: CategoryService) { }

  @Post()
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return await this.categoryService.create(createCategoryDto, file);
  }
  @Get()
  async findAll(
    @Query('type') type?: string,  // type est un paramètre de requête
  ): Promise<{ data: CategoryEntity[] }> {  // Retourne un objet avec "data" contenant un tableau
    const categories = await this.categoryService.findAll(type);
    return { data: categories };  // Encapsule le tableau de catégories dans "data"
  }

  @Get('parents')
  async findAllParents(
    @Query('type') type?: string,  
  ): Promise<{ data: CategoryEntity[] }> {  
    const categories = await this.categoryService.findAllParent(type);
    return { data: categories }; 
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<{ data: CategoryEntity }> {  // Retourne un objet avec "data"
    const category = await this.categoryService.findOne(id);
    return { data: category };  // Retourne la catégorie encapsulée dans "data"
  }

  // Mettre à jour une catégorie existante
  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @UseInterceptors(FileInterceptor('image'))
  async update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ message: string; data: CategoryEntity }> {
    const { message, data } = await this.categoryService.update(id, updateCategoryDto, file);
    return { message, data };
  }


  @Get('/by-type/:type')
  async findByTypeCompany(@Param('type') type: string): Promise<{ data: CategoryEntity[] }> {
    const categories = await this.categoryService.findByTypeCompany(type);
    return { data: categories };
  }

  @Get('parent/:parentId')
  async getCategoriesByParentId(
    @Param('parentId') parentId: string,
    @Query('page') page: string,   // Paramètre page
    @Query('limit') limit: string, // Paramètre limit
  ): Promise<{ data: CategoryEntity[]; pagination: { totalItems: number; currentPage: number; totalPages: number; itemsPerPage: number } }> {
    // Si parentId est 'null', on le convertit en null. Sinon, on le garde comme chaîne.
    const parent = parentId === 'null' ? null : parentId;

    // Convertir les paramètres page et limit en nombres, ou définir des valeurs par défaut
    const pageNumber = parseInt(page, 10) || 1;  // Valeur par défaut 1
    const limitNumber = parseInt(limit, 10) || 10;  // Valeur par défaut 10

    // Appel de la méthode pour obtenir les catégories par parentId avec pagination
    const { categories, pagination } = await this.categoryService.findByParentId(
      parent,
      { page: pageNumber, limit: limitNumber },
    );

    // Retourner les catégories sous la clé 'data' et inclure les informations de pagination
    return { data: categories, pagination };
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ data: string }> {
    await this.categoryService.remove(id);
    return { data: `Category with id ${id} removed successfully` };
  }
}
