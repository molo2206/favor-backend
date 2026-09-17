import { Injectable } from '@nestjs/common';
import { CreateCompanyHasResourceDto } from './dto/create-company_has_resource.dto';
import { UpdateCompanyHasResourceDto } from './dto/update-company_has_resource.dto';

@Injectable()
export class CompanyHasResourceService {
  create(createCompanyHasResourceDto: CreateCompanyHasResourceDto) {
    return 'This action adds a new companyHasResource';
  }

  findAll() {
    return `This action returns all companyHasResource`;
  }

  findOne(id: number) {
    return `This action returns a #${id} companyHasResource`;
  }

  update(id: number, updateCompanyHasResourceDto: UpdateCompanyHasResourceDto) {
    return `This action updates a #${id} companyHasResource`;
  }

  remove(id: number) {
    return `This action removes a #${id} companyHasResource`;
  }
}
