import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CompanyHasResourceService } from './company_has_resource.service';
import { CreateCompanyHasResourceDto } from './dto/create-company_has_resource.dto';
import { UpdateCompanyHasResourceDto } from './dto/update-company_has_resource.dto';

@Controller('company-has-resource')
export class CompanyHasResourceController {
  constructor(private readonly companyHasResourceService: CompanyHasResourceService) {}

  @Post()
  create(@Body() createCompanyHasResourceDto: CreateCompanyHasResourceDto) {
    return this.companyHasResourceService.create(createCompanyHasResourceDto);
  }

  @Get()
  findAll() {
    return this.companyHasResourceService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companyHasResourceService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCompanyHasResourceDto: UpdateCompanyHasResourceDto) {
    return this.companyHasResourceService.update(+id, updateCompanyHasResourceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.companyHasResourceService.remove(+id);
  }
}
