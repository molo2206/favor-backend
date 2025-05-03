import { Controller, Post, Body, UseGuards, UseInterceptors, UploadedFile, Param, UsePipes, ValidationPipe, Put, Patch, Get, Query } from '@nestjs/common';
import { CompanyService } from './company.service';
import { FileInterceptor } from '@nestjs/platform-express';
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
  constructor(private readonly companyService: CompanyService, private readonly userHasCompanyService: UserHasCompanyService,
    private readonly mailService: MailService,
  ) { }

  @Post()
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(FileInterceptor('logo'))
  async createCompany(
    @UploadedFile() logo: Express.Multer.File,
    @Body() dto: CreateCompanyDto,
    @CurrentUser() currentUser: UserEntity,
  ) {
    const result = await this.companyService.createCompanyWithUser(dto, currentUser, logo);
    await this.mailService.sendHtmlEmail(
      currentUser.email,
      'Votre entreprise a été créée avec succès',
      'company-status-update.html',
      { companyName: dto.companyName, status: 'PENDING', year: new Date().getFullYear() }
    );
    return result;
  }

  @Put(':id')
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(FileInterceptor('logo'))  // Intercepteur pour le fichier logo
  async updateCompany(
    @Param('companyId') companyId: string,  // ID de l'entreprise à mettre à jour
    @Body() dto: Partial<CreateCompanyDto>,  // DTO partiel pour la mise à jour
    @UploadedFile() logoFile: Express.Multer.File,  // Le logo peut être fourni en option
    @CurrentUser() currentUser: UserEntity,  // Utilisateur actuel pour l'association
  ) {
    // Appel du service pour mettre à jour l'entreprise avec l'utilisateur et le logo
    return this.companyService.updateCompanyWithUser(dto, companyId, currentUser.id, logoFile);
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
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyStatusDto,
  ) {
    return this.companyService.updateCompanyStatus(id, dto);
  }

  @Post('assign')
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async linkUserToCompany(
    @Body() dto: CreateUserHasCompanyDto,
  ): Promise<{ data: UserHasCompanyEntity }> {  // Type attendu { data: UserHasCompanyEntity }
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
}
