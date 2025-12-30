import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UploadedFiles,
  UseInterceptors,
  ClassSerializerInterceptor,
  UseGuards,
  ValidationPipe,
  UsePipes,
  BadRequestException,
  DefaultValuePipe,
  ParseIntPipe,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ServiceService } from './service.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { UpdateServiceStatusDto } from './enum/updateServiceStatusDto.enum';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { Public } from 'src/users/utility/decorators/public.decorator';
import { PrestataireRole } from './enum/prestataire-role.enum';
import { PrestataireType } from './enum/prestataire-type.enum';
import { UpdatePrestataireDto } from './dto/update-prestataire.dto';
import { CreatePrestataireDto } from './dto/create-prestataire.dto';

@Controller('services')
@UseInterceptors(ClassSerializerInterceptor)
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  // ================== Création de service ==================
  @Post()
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UseInterceptors(FilesInterceptor('images', 4)) // 'files' correspond au nom du champ multipart/form-data
  async create(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateServiceDto,
    @CurrentUser() user: UserEntity,
  ) {
    if (!files || files.length < 1 || files.length > 4)
      throw new BadRequestException('Le nombre d’images doit être compris entre 1 et 4');

    return this.serviceService.create(dto, files, user);
  }

  // ================== Lecture ==================
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

  @Get('/my/by-company')
  @Public()
  async findAllByCompany(
    @CurrentUser() user: UserEntity,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.serviceService.findAllByCompany(page, limit, user);
  }

  // ================== Mise à jour ==================
  @Patch(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UseInterceptors(FilesInterceptor('images', 4))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.serviceService.update(id, dto, files);
  }

  @Patch(':id/status')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateServiceStatusDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.serviceService.updateStatus(id, dto, user);
  }

  // ================== Suppression ==================
  @Delete(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async remove(@Param('id') id: string) {
    return this.serviceService.remove(id);
  }

  // ================== Prestataires ==================
  @Post(':serviceId/prestataires/:prestataireId')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async assignPrestataire(
    @Param('serviceId') serviceId: string,
    @Param('prestataireId') prestataireId: string,
    @Body('role') role?: string,
    @Body('tarif') tarif?: number,
    @Body('type') type?: string,
  ) {
    // Convertir le string en enum, si role est défini
    const roleEnum = role ? (PrestataireRole as any)[role] : undefined;
    if (role && !roleEnum) {
      throw new BadRequestException('Role invalide');
    }

    // Même chose pour type si nécessaire
    const typeEnum = type ? (PrestataireType as any)[type] : undefined;
    if (type && !typeEnum) {
      throw new BadRequestException('Type invalide');
    }

    return this.serviceService.assignPrestataireToService(
      serviceId,
      prestataireId,
      roleEnum,
      tarif,
      typeEnum,
    );
  }

  @Delete(':serviceId/prestataires/:prestataireId')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async removePrestataire(
    @Param('serviceId') serviceId: string,
    @Param('prestataireId') prestataireId: string,
  ) {
    return this.serviceService.removePrestataireFromService(serviceId, prestataireId);
  }

  @Get(':serviceId/by-service/prestataires')
  async getPrestataires(@Param('serviceId') serviceId: string) {
    return this.serviceService.getPrestatairesByService(serviceId);
  }

  @Get('prestataire/:prestataireId/services')
  async getServicesByPrestataire(@Param('prestataireId') prestataireId: string) {
    return this.serviceService.getServicesByPrestataire(prestataireId);
  }
  // Créer un prestataire
  @Post('prestataire')
  @UseGuards(AuthentificationGuard)
  @UseInterceptors(FileInterceptor('image')) // un seul fichier
  async createPrestataire(
    @Body() dto: CreatePrestataireDto & { serviceIds?: string[] },
    @UploadedFile() image?: Express.Multer.File, // singular
  ) {
    return this.serviceService.createPrestataire(dto, image);
  }

  // Mettre à jour un prestataire
  @Patch('/prestataire/:id')
  @UseGuards(AuthentificationGuard)
  @UseInterceptors(FileInterceptor('image')) // un seul fichier
  async updatePrestataire(
    @Param('id') id: string,
    @Body() dto: UpdatePrestataireDto & { serviceIds?: string[] },
    @UploadedFile() image?: Express.Multer.File, // singular
  ) {
    return this.serviceService.updatePrestataire(id, dto, image);
  }

  @Get('published/public')
  @Public()
  async getPublishedService(
    @Query('categoryId') categoryId?: string,
    @Query('countryId') countryId?: string,
    @Query('cityId') cityId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ) {
    return this.serviceService.findPublished(categoryId, countryId, cityId, page, limit);
  }

  @Get('published/public/by-company/:companyId')
  @Public()
  async getPublishedByCompany(
    @Param('companyId') companyId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ) {
    return this.serviceService.findPublishedByCompany(companyId, page, limit);
  }

  @Get('prestataire/company')
  @UseGuards(AuthentificationGuard)
  async getPrestatairesByCompany(@CurrentUser() user: UserEntity) {
    return this.serviceService.findPrestatairesByCompany(user);
  }

  @Get('prestataire/service_published/company')
  @UseGuards(AuthentificationGuard)
  async findPrestatairesByCompanyPublished(@CurrentUser() user: UserEntity) {
    return this.serviceService.findPrestatairesByCompanyPublished(user);
  }
}
