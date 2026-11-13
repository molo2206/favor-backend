import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CreateUserHasCompanyDto } from './dto/create-user_has_company.dto';
import { UpdateUserHasCompanyDto } from './dto/update-user_has_company.dto';
import { UserHasCompanyService } from './user_has_company.service';

@Controller('user-has-company')
export class UserHasCompanyController {
  constructor(private readonly userHasCompanyService: UserHasCompanyService) {}

  @Post()
  create(@Body() createUserHasCompanyDto: CreateUserHasCompanyDto) {
    return this.userHasCompanyService.create(createUserHasCompanyDto);
  }

  @Get()
  findAll() {
    return this.userHasCompanyService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userHasCompanyService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserHasCompanyDto: UpdateUserHasCompanyDto) {
    return this.userHasCompanyService.update(+id, updateUserHasCompanyDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userHasCompanyService.remove(+id);
  }
}
