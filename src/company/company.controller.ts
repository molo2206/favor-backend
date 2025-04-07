import { Controller, Post, Body, UseGuards, UseInterceptors, UploadedFile, Param, UsePipes, ValidationPipe, Put } from '@nestjs/common';
import { CompanyService } from './company.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { extname } from 'path';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { CreateCompanyDto } from './dto/create-company.dto';

@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) { }



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
}
