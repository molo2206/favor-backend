import {
    Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';

@Controller('hr/employees')
@UseGuards(AuthentificationGuard)
export class EmployeesController {
    constructor(private readonly employeesService: EmployeesService) { }

    @Post() create(@Body() dto: CreateEmployeeDto) {
        return this.employeesService.create(dto);
    }

    @Get() findAll(
        @Query('companyId') companyId?: string,
        @Query('branchId') branchId?: string,
        @Query('departmentId') departmentId?: string,
        @Query('status') status?: string,
        @Query('search') search?: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.employeesService.findAll({
            companyId, branchId, departmentId, status, search,
            page: Number(page) || 1,
            limit: Number(limit) || 20,
        });
    }

    @Get(':id') findOne(@Param('id') id: string) {
        return this.employeesService.findOne(id);
    }

    @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
        return this.employeesService.update(id, dto);
    }

    @Delete(':id') remove(@Param('id') id: string) {
        return this.employeesService.remove(id);
    }
}