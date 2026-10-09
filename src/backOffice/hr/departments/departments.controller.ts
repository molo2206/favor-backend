import {
    Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';

@Controller('hr/departments')
@UseGuards(AuthentificationGuard)
export class DepartmentsController {
    constructor(private readonly departmentsService: DepartmentsService) { }

    @Post() create(@Body() dto: CreateDepartmentDto) {
        return this.departmentsService.create(dto);
    }

    @Get() findAll(@Query('companyId') companyId?: string) {
        return this.departmentsService.findAll(companyId);
    }

    @Get(':id') findOne(@Param('id') id: string) {
        return this.departmentsService.findOne(id);
    }

    @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
        return this.departmentsService.update(id, dto);
    }

    @Delete(':id') remove(@Param('id') id: string) {
        return this.departmentsService.remove(id);
    }
}