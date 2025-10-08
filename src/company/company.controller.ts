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

    await this.mailService.sendHtmlEmail(
      currentUser.email,
      'Votre entreprise a été créée avec succès',
      'company-status-update.html',
      { companyName: dto.companyName, status: 'PENDING', year: new Date().getFullYear() },
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
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.companyService.findCompanyValidatedByType(type, Number(page), Number(limit));
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
}
