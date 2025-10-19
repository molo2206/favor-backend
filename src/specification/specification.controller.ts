import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { SpecificationService } from './specification.service';
import { CreateSpecificationDto } from './dto/create-specification.dto';
import { UpdateSpecificationDto } from './dto/update-specification.dto';

@Controller('specifications')
export class SpecificationController {
  constructor(private readonly specService: SpecificationService) {}

  @Post()
  create(@Body() dto: CreateSpecificationDto) {
    return this.specService.create(dto);
  }

  @Get()
  findAll() {
    return this.specService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.specService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSpecificationDto) {
    return this.specService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.specService.remove(id);
  }

  @Get('category/:categoryId')
  findByCategory(@Param('categoryId') categoryId: string) {
    return this.specService.findByCategory(categoryId);
  }
}
