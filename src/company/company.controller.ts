import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  Param,
  UsePipes,
  ValidationPipe,
  Put,
  Patch,
  Get,
  Query,
  UploadedFiles,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import {
  AnyFilesInterceptor,
  FileFieldsInterceptor,
} from '@nestjs/platform-express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CompanyEntity } from './entities/company.entity';
import { CreateUserHasCompanyDto } from 'src/user_has_company/dto/create-user_has_company.dto';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { UserHasCompanyService } from 'src/user_has_company/user_has_company.service';
import { UpdateCompanyStatusDto } from './dto/update-company-status.dto';
import { MailService } from 'src/email/email.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { CreateCityDto } from './dto/create-city.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { UpdateCityDto } from './dto/update-city.dto';
import {
  CreateCompanyAdminDto,
  ResourcePermissionDto,
} from './dto/create-company-admin.dto';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { SetUserCompanyPermissionsDto, SetUserCompanyPermissionsResponseDto } from './dto/setUserCompanyPermissions.dto';
import { AssignUserToCompanyDto } from './dto/assign-user-to-company.dto';
import { UserRole } from 'src/users/enum/user-role-enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from 'src/users/utility/guards/permissions.guard';
import { CompanyPermissionsGuard } from 'src/users/utility/guards/company-permissions.guard';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { I18nService } from 'src/libs/common/src';
import { Request } from 'express';

@Controller('company')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly userHasCompanyService: UserHasCompanyService,
    private readonly mailService: MailService,
    @InjectRepository(UserHasCompanyEntity)
    private readonly userHasCompanyRepository: Repository<UserHasCompanyEntity>,
    private readonly i18n: I18nService,
  ) { }

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];

    if (!acceptLanguage) return 'fr';

    const primary = acceptLanguage
      .split(',')[0]
      .split(';')[0]
      .trim()
      .split('-')[0]
      .toLowerCase();

    const supported = ['fr', 'en', 'sw', 'es', 'ar'];

    return supported.includes(primary) ? primary : 'fr';
  }
  @Post()
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.CREATE, 'company')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(AnyFilesInterceptor())
  async createCompany(
    @Req() req: Request,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateCompanyDto,
    @CurrentUser() currentUser: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    const logo = files.find((file) => file.fieldname === 'logo');
    const banner = files.find((file) => file.fieldname === 'banner');

    const result = await this.companyService.createCompanyWithUser(
      dto,
      currentUser,
      lang,
      logo,
      banner,
    );
    return result;
  }

  @Get('shipping/all')
  async getCompaniesWithShipping() {
    const companies = await this.companyService.getCompaniesWithShippingResource();
    return { message: 'Companies with SHIPPING resource', data: companies };
  }

  @Put()
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'company')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(AnyFilesInterceptor())
  async updateCompany(
    @Req() req: Request,
    @Body() dto: Partial<CreateCompanyDto>,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() current_user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    const logo = files.find((file) => file.fieldname === 'logo');
    const banner = files.find((file) => file.fieldname === 'banner');

    return this.companyService.updateCompanyWithUser(
      dto,
      current_user,
      lang,
      logo,
      banner,
    );
  }

  @Post('admin')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.CREATE, 'company')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'logo', maxCount: 1 },
      { name: 'banner', maxCount: 1 },
    ]),
  )
  async createCompanyAdmin(
    @Req() req: Request,
    @UploadedFiles()
    files: {
      logo?: Express.Multer.File[];
      banner?: Express.Multer.File[];
    },
    @Body() dto: CreateCompanyAdminDto,
  ) {
    const lang = this.extractLanguage(req);
    const logo = files?.logo?.[0];
    const banner = files?.banner?.[0];

    return this.companyService.createCompanyWithUserAdmin(dto, lang, logo, banner);
  }

  @Put('admin/:id')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'company')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'logo', maxCount: 1 },
      { name: 'banner', maxCount: 1 },
    ]),
  )
  async updateCompanyAdmin(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: Partial<CreateCompanyAdminDto>,
    @UploadedFiles()
    files: {
      logo?: Express.Multer.File[];
      banner?: Express.Multer.File[];
    },
  ) {
    const lang = this.extractLanguage(req);
    const logo = files?.logo?.[0];
    const banner = files?.banner?.[0];

    return this.companyService.updateCompanyWithUserAdmin(
      id,
      dto,
      lang,
      logo,
      banner,
    );
  }

  @Patch('me/active-company/:companyId')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'company')
  async setMyActiveCompany(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('companyId') companyId: string,
  ) {
    const lang = this.extractLanguage(req);
    const updated = await this.companyService.setActiveCompany(
      user.id,
      companyId,
      lang,
    );
    return updated;
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateCompanyStatusDto,
  ) {
    const lang = this.extractLanguage(req);
    return this.companyService.updateCompanyStatus(id, dto, lang);
  }

  @Post('assign')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.CREATE, 'UserHasCompanyEntity')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async linkUserToCompany(
    @Req() req: Request,
    @Body() dto: CreateUserHasCompanyDto,
  ): Promise<{ data: UserHasCompanyEntity }> {
    const lang = this.extractLanguage(req);
    return await this.companyService.CreateUserToCompany(dto, lang);
  }

  @Get('validated')
  async getValidatedCompanies(
    @Req() req: Request,
    @Query('type') type?: string,
    @Query('countryId') countryId?: string,
    @Query('cityId') cityId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    const lang = this.extractLanguage(req);
    return this.companyService.findCompanyValidatedByType(
      type,
      countryId,
      cityId,
      categoryId,
      Number(page),
      Number(limit),
      lang,
    );
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'UserHasCompanyEntity')
  async getCompaniesByType(
    @Req() req: Request,
    @Query('type') type?: string,
  ): Promise<{ message: string; data: CompanyEntity[] }> {
    const lang = this.extractLanguage(req);
    return this.companyService.findByType(type, lang);
  }

  @Get(':id')
  async getCompanyById(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ data: CompanyEntity }> {
    const lang = this.extractLanguage(req);
    return this.companyService.findByCompany(id, lang);
  }

  @Get('my/companies')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'company')
  async getMyCompanies(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    const companies = await this.companyService.findAllByUser(user.id, lang);
    return { data: companies };
  }

  @Get('my/dashboard')
  @UseGuards(AuthentificationGuard, CompanyPermissionsGuard)
  @AuditAction(ActionType.VIEW, 'company')
  async getDashboard(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const lang = this.extractLanguage(req);
    if (!user.activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('company_no_active', lang),
      );
    }
    return await this.companyService.getCompanyDashboard(
      user,
      startDate,
      endDate,
      lang,
    );
  }

  @Post('country')
  async createCountry(
    @Req() req: Request,
    @Body() dto: CreateCountryDto,
  ) {
    const lang = this.extractLanguage(req);
    const country = await this.companyService.createCountry(dto, lang);
    return {
      message: await this.i18n.translate('company_country_created', lang),
      data: country,
    };
  }

  @Post('city')
  async createCity(
    @Req() req: Request,
    @Body() dto: CreateCityDto,
  ) {
    const lang = this.extractLanguage(req);
    const city = await this.companyService.createCity(dto, lang);
    return {
      message: await this.i18n.translate('company_city_created', lang),
      data: city,
    };
  }

  @Patch('country/:id')
  async updateCountry(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateCountryDto,
  ) {
    const lang = this.extractLanguage(req);
    return await this.companyService.updateCountry(id, dto, lang);
  }

  @Patch('city/:id')
  async updateCity(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateCityDto,
  ) {
    const lang = this.extractLanguage(req);
    return await this.companyService.updateCity(id, dto, lang);
  }

  @Get('country/all')
  async getAllCountries(@Req() req: Request) {
    const lang = this.extractLanguage(req);
    return {
      message: await this.i18n.translate('company_resources_retrieved', lang),
      data: await this.companyService.getAllCountries(lang),
    };
  }

  @Get('city/all')
  async getAllCities(@Req() req: Request) {
    const lang = this.extractLanguage(req);
    return {
      message: await this.i18n.translate('company_resources_retrieved', lang),
      data: await this.companyService.getAllCities(lang),
    };
  }

  @Get('city/by-country/:countryId')
  async getCitiesByCountry(
    @Req() req: Request,
    @Param('countryId') countryId: string,
  ) {
    const lang = this.extractLanguage(req);
    return {
      message: await this.i18n.translate('company_resources_retrieved', lang),
      data: await this.companyService.getCitiesByCountry(countryId, lang),
    };
  }

  @Get('country/one/:id')
  async getCountry(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const lang = this.extractLanguage(req);
    const country = await this.companyService.getCountryById(id, lang);
    return {
      message: await this.i18n.translate('company_resources_retrieved', lang),
      data: country,
    };
  }

  @Get('city/one/:id')
  async getCity(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const lang = this.extractLanguage(req);
    const city = await this.companyService.getCityById(id, lang);
    return {
      message: await this.i18n.translate('company_resources_retrieved', lang),
      data: city,
    };
  }

  @Patch(':type/:id/toggle-status')
  @UseGuards(AuthentificationGuard)
  async toggleStatus(
    @Req() req: Request,
    @Param('type') type: 'country' | 'city',
    @Param('id') id: string,
  ) {
    const lang = this.extractLanguage(req);
    const entity = await this.companyService.toggleStatus(type, id, lang);
    const message = await this.i18n.translate('company_status_updated', lang);
    return {
      message,
      data: entity,
    };
  }

  //============================Permissions=============================

  @Post('admin/permissions')
  @UseGuards(AuthentificationGuard)
  async setUserCompanyPermissions(
    @Req() req: Request,
    @Body() dto: SetUserCompanyPermissionsDto,
  ): Promise<{ message: string; data: SetUserCompanyPermissionsResponseDto }> {
    const lang = this.extractLanguage(req);
    return this.companyService.setUserCompanyPermissions(dto, lang);
  }


  @Get('resources/byCompany')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'company_resources')
  async getCompanyResources(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    const activeCompanyId = user.activeCompanyId;
    if (!activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('company_no_active', lang),
      );
    }
    const resources = await this.companyService.getCompanyResources(activeCompanyId, lang);
    return {
      message: await this.i18n.translate('company_resources_retrieved', lang),
      data: resources,
    };
  }

  @Post('admin/assign-user')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'company')
  async assignUserToCompany(
    @Req() req: Request,
    @Body() dto: AssignUserToCompanyDto,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    return this.companyService.assignUserToCompany(dto, user, lang);
  }

  @Get('collaborators/bycompany')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'company_collaborators')
  async getCompanyCollaborators(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    const activeCompanyId = user.activeCompanyId;
    if (!activeCompanyId) {
      throw new BadRequestException(
        await this.i18n.translate('company_no_active', lang),
      );
    }
    const collaborators = await this.companyService.getCompanyCollaborators(activeCompanyId, lang);
    return {
      message: await this.i18n.translate('company_collaborators_retrieved', lang),
      data: collaborators,
    };
  }

  @Get('collaborators/bycompany/:userHasCompanyId')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'company_collaborator')
  async getOneCollaboratorByUserHasCompanyId(
    @Req() req: Request,
    @Param('userHasCompanyId') userHasCompanyId: string,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    const userHasCompany = await this.userHasCompanyRepository.findOne({
      where: { id: userHasCompanyId },
      relations: ['company'],
    });
    if (!userHasCompany) {
      throw new NotFoundException(await this.i18n.translate('company_not_found', lang));
    }
    if (
      userHasCompany.company.id !== user.activeCompanyId &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException(await this.i18n.translate('company_not_authorized', lang));
    }

    const collaborator =
      await this.companyService.getOneCollaboratorByUserHasCompanyId(
        userHasCompanyId,
        lang,
      );
    return {
      message: await this.i18n.translate('company_collaborators_retrieved', lang),
      data: collaborator,
    };
  }

  @Patch('collaborators/:userHasCompanyId/permissions')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'company_collaborator_permissions')
  async updateUserCompanyPermissions(
    @Req() req: Request,
    @Param('userHasCompanyId') userHasCompanyId: string,
    @Body() body: { branchId?: string; resources: ResourcePermissionDto[] },
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    const result = await this.companyService.updateUserCompanyPermissions(
      userHasCompanyId,
      body.branchId,
      body.resources,
      user,
      lang,
    );
    return { message: result.message };
  }

  @Post('partner')
  @UseGuards(AuthentificationGuard, CompanyPermissionsGuard)
  @Permissions({ resource: 'COMPANY', action: 'canUpdate' })
  async createPartner(
    @Req() req: Request,
    @Body() dto: CreatePartnerDto,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    return this.companyService.createPartner(dto, user, lang);
  }

  @Get('partners/all')
  @UseGuards(AuthentificationGuard, CompanyPermissionsGuard)
  @Permissions({ resource: 'COMPANY', action: 'canUpdate' })
  async getPartners(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
  ) {
    const lang = this.extractLanguage(req);
    return this.companyService.getPartners(user, lang);
  }
}