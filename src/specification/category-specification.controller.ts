import { Body, Controller, Post, Delete, Get, Param, Query } from '@nestjs/common';
import { CategorySpecificationService } from './category-specification.service';
import { CreateCategorySpecificationDto } from './dto/create-category-specification.dto';
import { DeleteCategorySpecificationDto } from './dto/delete-category-specification.dto';

@Controller('category-specifications')
export class CategorySpecificationController {
  constructor(private readonly catSpecService: CategorySpecificationService) {}

  @Post()
  addSpecification(@Body() dto: CreateCategorySpecificationDto) {
    return this.catSpecService.addSpecificationToCategory(
      dto.categoryId,
      dto.specificationId,
      dto.required,
      dto.displayOrder
    );
  }

  @Delete()
  removeSpecification(@Body() dto: DeleteCategorySpecificationDto) {
    return this.catSpecService.removeAllSpecificationsFromCategory(
      dto.categoryId,
    );
  }

  @Get('category/:categoryId')
  findByCategory(@Param('categoryId') categoryId: string) {
    return this.catSpecService.findByCategory(categoryId);
  }
}
