import { Controller, Get, Post, Put, Delete, Param, Body, Patch } from '@nestjs/common';
import { BranchService } from './branch.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/create-branch.dto';

@Controller('branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Get()
  async findAll() {
    // renvoie { message, data }
    return this.branchService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.branchService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateBranchDto) {
    return this.branchService.create(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchService.update(id, dto);
  }

  @Delete(':id')
  async softDelete(@Param('id') id: string) {
    return this.branchService.softDelete(id);
  }
}
