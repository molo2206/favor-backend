import { Controller, Get, Post, Body, Param, Patch, Delete, UsePipes, ValidationPipe, UseGuards } from '@nestjs/common';
import { TypeCompany } from './entities/type_company.entity';
import { TypeCompanyService } from './type_company.service';
import { CreateTypeCompanyDto } from './dto/create-type_company.dto';
import { UpdateTypeCompanyDto } from './dto/update-type_company.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';

@Controller('type-companies')
export class TypeCompanyController {
  constructor(private readonly typeCompanyService: TypeCompanyService
  ) { }

  @Post()
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async create(@Body() dto: CreateTypeCompanyDto): Promise<TypeCompany> {
    return await this.typeCompanyService.create(dto);
  }

  @Get()
  async findAll(): Promise<TypeCompany[]> {
    return await this.typeCompanyService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<TypeCompany> {
    return await this.typeCompanyService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTypeCompanyDto,
  ): Promise<TypeCompany> {
    return await this.typeCompanyService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    return await this.typeCompanyService.remove(id);
  }
}
