import { Injectable } from '@nestjs/common';
import { CreateUserHasCompanyDto } from './dto/create-user_has_company.dto';
import { UpdateUserHasCompanyDto } from './dto/update-user_has_company.dto';

@Injectable()
export class UserHasCompanyService {
  create(createUserHasCompanyDto: CreateUserHasCompanyDto) {
    return 'This action adds a new userHasCompany';
  }

  findAll() {
    return `This action returns all userHasCompany`;
  }

  findOne(id: number) {
    return `This action returns a #${id} userHasCompany`;
  }

  update(id: number, updateUserHasCompanyDto: UpdateUserHasCompanyDto) {
    return `This action updates a #${id} userHasCompany`;
  }

  remove(id: number) {
    return `This action removes a #${id} userHasCompany`;
  }
}
