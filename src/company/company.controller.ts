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
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
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
import { CreateCompanyAdminDto } from './dto/create-company-admin.dto';

@Controller('company')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly userHasCompanyService: UserHasCompanyService,
    private readonly mailService: MailService,
  ) {}

  @Post()
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(AnyFilesInterceptor())
  async createCompany(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateCompanyDto,
    @CurrentUser() currentUser: UserEntity,
  ) {
    const logo = files.find((file) => file.fieldname === 'logo');
    const banner = files.find((file) => file.fieldname === 'banner');

    const result = await this.companyService.createCompanyWithUser(
      dto,
      currentUser,
      logo,
      banner,
    );
    return result;
  }

  @Put()
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(AnyFilesInterceptor())
  async updateCompany(
    @Body() dto: Partial<CreateCompanyDto>,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() current_user: UserEntity,
  ) {
    const logo = files.find((file) => file.fieldname === 'logo');
    const banner = files.find((file) => file.fieldname === 'banner');

    return this.companyService.updateCompanyWithUser(dto, current_user, logo, banner);
  }

  @Post('admin')
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(AnyFilesInterceptor())
  async createCompanyAdmin(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateCompanyAdminDto,
  ) {
    const logo = files.find((file) => file.fieldname === 'logo');
    const banner = files.find((file) => file.fieldname === 'banner');

    const result = await this.companyService.createCompanyWithUserAdmin(dto, logo, banner);
    return result;
  }

  @Put('admin/:id')
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(AnyFilesInterceptor())
  async updateCompanyAdmin(
    @Param('id') id: string,
    @Body() dto: Partial<CreateCompanyAdminDto>,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const logo = files.find((file) => file.fieldname === 'logo');
    const banner = files.find((file) => file.fieldname === 'banner');

    return this.companyService.updateCompanyWithUserAdmin(id, dto, logo, banner);
  }

  @Patch('me/active-company/:companyId')
  @UseGuards(AuthentificationGuard)
  async setMyActiveCompany(
    @CurrentUser() user: UserEntity,
    @Param('companyId') companyId: string,
  ) {
    const updated = await this.companyService.setActiveCompany(user.id, companyId);
    return updated;
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateCompanyStatusDto) {
    return this.companyService.updateCompanyStatus(id, dto);
  }

  @Post('assign')
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async linkUserToCompany(
    @Body() dto: CreateUserHasCompanyDto,
  ): Promise<{ data: UserHasCompanyEntity }> {
    // Type attendu { data: UserHasCompanyEntity }
    return await this.companyService.CreateUserToCompany(dto);
  }

  @Get('validated')
  async getValidatedCompanies(
    @Query('type') type?: string,
    @Query('countryId') countryId?: string,
    @Query('cityId') cityId?: string,
    @Query('categoryId') categoryId?: string, // Ajout du filtre categoryId
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.companyService.findCompanyValidatedByType(
      type,
      countryId,
      cityId,
      categoryId, // Passage à la méthode du service
      Number(page),
      Number(limit),
    );
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  async getCompaniesByType(
    @Query('type') type?: string,
  ): Promise<{ message: string; data: CompanyEntity[] }> {
    return this.companyService.findByType(type);
  }

  @Get(':id')
  @UseGuards(AuthentificationGuard)
  async getCompanyById(@Param('id') id: string): Promise<{ data: CompanyEntity }> {
    return this.companyService.getCompanyById(id);
  }

  @Get('my/companies')
  @UseGuards(AuthentificationGuard)
  async getMyCompanies(@CurrentUser() user: UserEntity) {
    const companies = await this.companyService.findAllByUser(user.id);
    return { data: companies };
  }

  @Get('my/dashboard')
  @UseGuards(AuthentificationGuard)
  async getDashboard(@CurrentUser() user: UserEntity) {
    return await this.companyService.getCompanyDashboard(user);
  }

  @Post('country')
  async createCountry(@Body() dto: CreateCountryDto) {
    const country = await this.companyService.createCountry(dto);
    return { message: 'Pays créé avec succès', data: country };
  }

  @Post('city')
  async createCity(@Body() dto: CreateCityDto) {
    const city = await this.companyService.createCity(dto);
    return { message: 'Ville créée avec succès', data: city };
  }

  @Patch('country/:id')
  async updateCountry(@Param('id') id: string, @Body() dto: UpdateCountryDto) {
    return await this.companyService.updateCountry(id, dto);
  }

  @Patch('city/:id')
  async updateCity(@Param('id') id: string, @Body() dto: UpdateCityDto) {
    return await this.companyService.updateCity(id, dto);
  }

  @Get('country/all')
  async getAllCountries() {
    return {
      message: 'Liste des pays récupérée avec succès',
      data: await this.companyService.getAllCountries(),
    };
  }

  @Get('city/all')
  async getAllCities() {
    return {
      message: 'Liste des villes récupérée avec succès',
      data: await this.companyService.getAllCities(),
    };
  }

  @Get('city/by-country/:countryId')
  async getCitiesByCountry(@Param('countryId') countryId: string) {
    return {
      message: 'Liste des villes du pays récupérée avec succès',
      data: await this.companyService.getCitiesByCountry(countryId),
    };
  }

  @Get('country/one/:id')
  async getCountry(@Param('id') id: string) {
    const country = await this.companyService.getCountryById(id);
    return {
      message: 'Pays récupéré avec succès',
      data: country,
    };
  }

  @Get('city/one/:id')
  async getCity(@Param('id') id: string) {
    const city = await this.companyService.getCityById(id);
    return {
      message: 'Ville récupérée avec succès',
      data: city,
    };
  }
  @Patch(':type/:id/toggle-status')
  @UseGuards(AuthentificationGuard)
  async toggleStatus(@Param('type') type: 'country' | 'city', @Param('id') id: string) {
    const entity = await this.companyService.toggleStatus(type, id);
    return {
      message: `Le statut du ${type === 'country' ? 'pays' : 'ville'} "${entity.name}" a été mis à jour avec succès.`,
      data: entity,
    };
  }
}
