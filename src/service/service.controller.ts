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
  BadRequestException,
  Query,
  Delete,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';

import { FilesInterceptor } from '@nestjs/platform-express';
import { ServiceService } from './service.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { Public } from 'src/users/utility/decorators/public.decorator';
import { Service } from './entities/service.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { UpdateServiceStatusDto } from './enum/updateServiceStatusDto.enum';

@Controller('services')
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  @UseInterceptors(ClassSerializerInterceptor)
  @Post()
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(FilesInterceptor('files', 4)) // Jusqu'à 4 images
  async create(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateServiceDto,
    @CurrentUser() user: UserEntity,
  ) {
    if (!files || files.length < 1 || files.length > 4) {
      throw new BadRequestException('Le nombre d’images doit être compris entre 1 et 4');
    }

    const result = await this.serviceService.create(dto, files, user);
    return {
      message: result.message,
      data: result.data,
    };
  }

  @Get('one/:id')
  async getProductById(@Param('id') id: string): Promise<{ message: string; data: Service }> {
    return this.serviceService.findOne(id);
  }

  @Get()
  @Public()
  async getProductsByType(
    @Query('type') type?: string,
  ): Promise<{ message: string; data: Service[] }> {
    return this.serviceService.findByType(type);
  }

  @Get('published')
  @Public()
  async getPublishedServices(
    @Query('type') type?: string,
  ): Promise<{ message: string; data: Service[] }> {
    return this.serviceService.findPublishedServicesByType(type);
  }

  @Get('published/public')
  @Public()
  async getPublishedService(
    @Query('type') type?: string,
    @Query('companyId') companyId?: string,
    @Query('shopType') shopType?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.serviceService.findPublishedServicesByFilters(
      type,
      companyId,
      shopType,
      Number(page),
      Number(limit),
    );
  }

  @Get('by-active-company')
  @UseGuards(AuthentificationGuard) // L'utilisateur doit être connecté
  async getServicesByActiveCompany(@CurrentUser() user: UserEntity) {
    const services = await this.serviceService.findByActiveCompanyForUser(user);
    return { data: services };
  }

  @Get('group-by-type_first')
  @Public()
  async groupByType_first(): Promise<Record<string, Service>> {
    return this.serviceService.groupByType_First_Service();
  }

  @Get('/category')
  async findByCategoryId(@Query('categoryId') categoryId?: string) {
    const result = await this.serviceService.findByCategoryId(categoryId);
    return {
      message: result.message,
      data: result.data,
    };
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UseInterceptors(FilesInterceptor('files', 4))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.serviceService.update(id, dto, files);
  }

  @Get('published/public/bycategory')
  @Public()
  async getPublishedServiceByCategory(
    @Query('categoryId') categoryId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.serviceService.findByCategoryIdWithPagination(
      categoryId,
      Number(page),
      Number(limit),
    );
  }

  @Patch(':id/status')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateServiceStatusDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.serviceService.updateStatus(id, dto, user);
  }

  @Get('search')
  @Public()
  async search(@Query('search') query: string): Promise<{ message: string; data: Service[] }> {
    return this.serviceService.searchServices(query);
  }

  @Get()
  @Public()
  async findAll() {
    return this.serviceService.findAll();
  }

  @Get(':id')
  @Public()
  async findOne(@Param('id') id: string) {
    return this.serviceService.findOne(id);
  }

  @Delete(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async remove(@Param('id') id: string) {
    return this.serviceService.remove(id);
  }
}
