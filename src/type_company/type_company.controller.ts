import { Controller, Get, Post, Body, Param, Patch, Delete, UsePipes, ValidationPipe, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { TypeCompany } from './entities/type_company.entity';
import { TypeCompanyService } from './type_company.service';
import { CreateTypeCompanyDto } from './dto/create-type_company.dto';
import { UpdateTypeCompanyDto } from './dto/update-type_company.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize.roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from 'src/users/enum/user-role-enum';

@Controller('type-companies')
export class TypeCompanyController {
  constructor(private readonly typeCompanyService: TypeCompanyService
  ) { }

  @Post()
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('image'))
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(
    @Body() dto: CreateTypeCompanyDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ data: TypeCompany }> {
    return await this.typeCompanyService.create(dto, file);
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('image'))
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateTypeCompanyDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ message: string; data: TypeCompany }> {
    const updatedType = await this.typeCompanyService.update(id, updateDto, file);
    return updatedType;  // Renvoie directement la réponse du service
  }



  @Get()
  async findAll(): Promise<{ data: TypeCompany[] }> {
    const typeCompanies = await this.typeCompanyService.findAll();
    return { data: typeCompanies };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<{ data: TypeCompany }> {
    const typeCompany = await this.typeCompanyService.findOne(id);
    return { data: typeCompany };
  }



  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    return await this.typeCompanyService.remove(id);
  }
}
