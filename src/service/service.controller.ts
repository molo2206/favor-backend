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
  BadRequestException,
  DefaultValuePipe,
  ParseIntPipe,
  UploadedFile,
  Req,
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
import { Request } from 'express';

@Controller('services')
@UseInterceptors(ClassSerializerInterceptor)
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) { }

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'fr';
    const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
    const supported = ['fr', 'en', 'sw', 'es','ar'];
    return supported.includes(primary) ? primary : 'fr';
  }

  // ================== Création de service ==================
  @Post()
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UseInterceptors(FilesInterceptor('images', 4))
  async create(
    @Req() req: Request,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateServiceDto,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    if (!files || files.length < 1 || files.length > 4)
      throw new BadRequestException(await this.serviceService['translate']('images_required', lang));
    return this.serviceService.create(dto, files, user, lang);
  }

  // ================== Lecture ==================
  @Get()
  @Public()
  async findAll(@Req() req: Request) {
    const lang = this.extractLanguage(req);
    return this.serviceService.findAll(lang);
  }

  @Get(':id')
  @Public()
  async findOne(@Req() req: Request, @Param('id') id: string) {
    const lang = this.extractLanguage(req);
    return this.serviceService.findOne(id, lang);
  }

  @Get('/my/by-company')
  @Public()
  async findAllByCompany(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    const lang = this.extractLanguage(req);
    return this.serviceService.findAllByCompany(page, limit, user, lang);
  }

  // ================== Mise à jour ==================
  @Patch(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UseInterceptors(FilesInterceptor('images', 4))
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const lang = this.extractLanguage(req);
    return this.serviceService.update(id, dto, files, lang);
  }

  @Patch(':id/status')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateServiceStatusDto,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    return this.serviceService.updateStatus(id, dto, user, lang);
  }

  // ================== Suppression ==================
  @Delete(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async remove(@Req() req: Request, @Param('id') id: string) {
    const lang = this.extractLanguage(req);
    return this.serviceService.remove(id, lang);
  }

  // ================== Prestataires ==================
  @Post(':serviceId/prestataires/:prestataireId')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async assignPrestataire(
    @Req() req: Request,
    @Param('serviceId') serviceId: string,
    @Param('prestataireId') prestataireId: string,
    @Body('role') role?: string,
    @Body('tarif') tarif?: number,
    @Body('type') type?: string,
  ) {
    const lang = this.extractLanguage(req);
    const roleEnum = role ? (PrestataireRole as any)[role] : undefined;
    if (role && !roleEnum) throw new BadRequestException('Role invalide');
    const typeEnum = type ? (PrestataireType as any)[type] : undefined;
    if (type && !typeEnum) throw new BadRequestException('Type invalide');
    return this.serviceService.assignPrestataireToService(
      serviceId,
      prestataireId,
      roleEnum,
      tarif,
      typeEnum,
      lang,
    );
  }

  @Delete(':serviceId/prestataires/:prestataireId')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async removePrestataire(
    @Req() req: Request,
    @Param('serviceId') serviceId: string,
    @Param('prestataireId') prestataireId: string,
  ) {
    const lang = this.extractLanguage(req);
    return this.serviceService.removePrestataireFromService(serviceId, prestataireId, lang);
  }

  @Get(':serviceId/by-service/prestataires')
  async getPrestataires(@Req() req: Request, @Param('serviceId') serviceId: string) {
    const lang = this.extractLanguage(req);
    return this.serviceService.getPrestatairesByService(serviceId, lang);
  }

  @Get('prestataire/:prestataireId/services')
  async getServicesByPrestataire(@Req() req: Request, @Param('prestataireId') prestataireId: string) {
    const lang = this.extractLanguage(req);
    return this.serviceService.getServicesByPrestataire(prestataireId, lang);
  }

  // Créer un prestataire
  @Post('prestataire')
  @UseGuards(AuthentificationGuard)
  @UseInterceptors(FileInterceptor('image'))
  async createPrestataire(
    @Req() req: Request,
    @Body() dto: CreatePrestataireDto & { serviceIds?: string[] },
    @UploadedFile() image?: Express.Multer.File,
  ) {
    const lang = this.extractLanguage(req);
    return this.serviceService.createPrestataire(dto, image, lang);
  }

  // Mettre à jour un prestataire
  @Patch('/prestataire/:id')
  @UseGuards(AuthentificationGuard)
  @UseInterceptors(FileInterceptor('image'))
  async updatePrestataire(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdatePrestataireDto & { serviceIds?: string[] },
    @UploadedFile() image?: Express.Multer.File,
  ) {
    const lang = this.extractLanguage(req);
    return this.serviceService.updatePrestataire(id, dto, image, lang);
  }

  @Get('published/public')
  @Public()
  async getPublishedService(
    @Req() req: Request,
    @Query('categoryId') categoryId?: string,
    @Query('countryId') countryId?: string,
    @Query('cityId') cityId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ) {
    const lang = this.extractLanguage(req);
    return this.serviceService.findPublished(categoryId, countryId, cityId, page, limit, lang);
  }

  @Get('published/public/by-company/:companyId')
  @Public()
  async getPublishedByCompany(
    @Req() req: Request,
    @Param('companyId') companyId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ) {
    const lang = this.extractLanguage(req);
    return this.serviceService.findPublishedByCompany(companyId, page, limit, lang);
  }

  @Get('prestataire/company')
  @UseGuards(AuthentificationGuard)
  async getPrestatairesByCompany(@Req() req: Request, @CurrentUser() user: UserEntity) {
    const lang = this.extractLanguage(req);
    return this.serviceService.findPrestatairesByCompany(user, 1, 10, lang);
  }

  @Get('prestataire/service_published/company')
  @UseGuards(AuthentificationGuard)
  async findPrestatairesByCompanyPublished(@Req() req: Request, @CurrentUser() user: UserEntity) {
    const lang = this.extractLanguage(req);
    return this.serviceService.findPrestatairesByCompanyPublished(user, lang);
  }
}