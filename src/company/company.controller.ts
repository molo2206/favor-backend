import { Controller, Post, Body, UseGuards, UseInterceptors, UploadedFile, Param, UsePipes, ValidationPipe, Put, Patch, Get } from '@nestjs/common';
import { CompanyService } from './company.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { extname } from 'path';
import { UpdateCompanyDto } from './dto/update-company.dto';
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
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: './uploads/company/logos',
        filename: (req, file, cb) => {
          const uniqueName = `${Date.now()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
    }),
  )
  async createOrUpdateCompany(
    @UploadedFile() logo: Express.Multer.File,
    @Body() dto: CreateCompanyDto,
    @CurrentUser() currentUser: UserEntity,
  ) {
    const logoPath = logo?.path ?? null;
    return this.companyService.createOrUpdateCompanyWithUser(dto, currentUser, logoPath);
  }

  @Put(':id')
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: './uploads/company/logos',
        filename: (req, file, cb) => {
          const uniqueName = `${Date.now()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
    }),
  )
  async updateCompany(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() currentUser: UserEntity,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let logoPath: string | undefined = undefined;
    if (file) {
      logoPath = `/uploads/company/logos/${file.filename}`;
    }

    return this.companyService.updateCompanyWithUser(dto, id, currentUser.id, logoPath);
  }

  @Patch(':id/toggle-status')
  @UseGuards(AuthentificationGuard, AuthorizeGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  async toggleStatus(@Param('id') id: string): Promise<CompanyEntity> {
    return this.companyService.toggleCompanyStatus(id);
  }


  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @Patch(':id/toggle-status')
  async toggleCompanyStatus(@Param('id') id: string): Promise<CompanyEntity> {
    return this.companyService.toggleCompanyStatus(id);
  }

  // ❌ PATCH /companies/:id/reject
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @Patch(':id/reject')
  async rejectCompany(@Param('id') id: string): Promise<CompanyEntity> {
    return this.companyService.rejectCompany(id);
  }

  @Post('assign')
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async linkUserToCompany(
    @Body() dto: CreateUserHasCompanyDto,
  ): Promise<UserHasCompanyEntity> {
    return await this.companyService.CreateUserToCompany(dto);
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  async getAllCompanies(): Promise<CompanyEntity[]> {
    return this.companyService.getAllCompanies();
  }

  // ✅ GET /companies/:id
  @Get(':id')
  @UseGuards(AuthentificationGuard)
  async getCompanyById(@Param('id') id: string): Promise<CompanyEntity> {
    return this.companyService.getCompanyById(id);
  }
}
