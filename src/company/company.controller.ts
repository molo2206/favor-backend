import { Controller, Post, Body, UseGuards, UseInterceptors, UploadedFile, Param, UsePipes, ValidationPipe, Put, Patch, Get } from '@nestjs/common';
import { CompanyService } from './company.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CompanyEntity } from './entities/company.entity';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize.roles.decorator';
import { AuthorizeGuard } from 'src/users/utility/guards/authorization.guard';
import { UserRole } from 'src/users/utility/common/user-role-enum';
import { CreateUserHasCompanyDto } from 'src/user_has_company/dto/create-user_has_company.dto';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { UserHasCompanyService } from 'src/user_has_company/user_has_company.service';

@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService, private readonly userHasCompanyService: UserHasCompanyService) { }

  @Post()
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(
    FileInterceptor('logo'),
  )
  async createOrUpdateCompany(
    @UploadedFile() logo: Express.Multer.File,
    @Body() dto: CreateCompanyDto,
    @CurrentUser() currentUser: UserEntity,
  ) {
    // Appel à la méthode de service pour créer ou mettre à jour l'entreprise
    return this.companyService.createOrUpdateCompanyWithUser(dto, currentUser, logo);
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

  @Patch(':id/toggle-status')
  @UseGuards(AuthentificationGuard, AuthorizeGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  async toggleStatus(@Param('id') id: string): Promise<{ data: CompanyEntity }> {
    return this.companyService.toggleCompanyStatus(id);
  }

  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @Patch(':id/toggle-status')
  async toggleCompanyStatus(@Param('id') id: string): Promise<{ data: CompanyEntity }> {
    return this.companyService.toggleCompanyStatus(id);
  }

  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @Patch(':id/reject')
  async rejectCompany(@Param('id') id: string): Promise<{ data: CompanyEntity }> {
    return this.companyService.rejectCompany(id);  // Retourner { data: rejectedCompany }
  }

  @Post('assign')
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async linkUserToCompany(
    @Body() dto: CreateUserHasCompanyDto,
  ): Promise<{ data: UserHasCompanyEntity }> {  // Type attendu { data: UserHasCompanyEntity }
    return await this.companyService.CreateUserToCompany(dto);
  }

  @Get('type/:typeId')
  async getCompaniesByType(
    @Param('typeId') typeId: string,
  ): Promise<{ data: CompanyEntity[] }> {
    return this.companyService.findByCompany(typeId);
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  async getAllCompanies(): Promise<{ data: CompanyEntity[] }> {
    return this.companyService.getAllCompanies();
  }

  @Get(':id')
  @UseGuards(AuthentificationGuard)
  async getCompanyById(@Param('id') id: string): Promise<{ data: CompanyEntity }> {
    return this.companyService.getCompanyById(id);
  }
}
