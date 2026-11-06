import { Controller, Post, Body, Get, Param, Delete } from '@nestjs/common';
import { CreateProductSpecificationValueDto } from './dto/create-product-specification-value.dto';
import { ProductSpecificationValueService } from './product-specification.service';

@Controller('product-specifications')
export class ProductSpecificationValueController {
  constructor(private readonly psValueService: ProductSpecificationValueService) {}

  @Post()
  create(@Body() dto: CreateProductSpecificationValueDto) {
    return this.psValueService.create(dto);
  }

  @Get('product/:productId')
  findByProduct(@Param('productId') productId: string) {
    return this.psValueService.findByProduct(productId);
  }

  @Delete('product/:productId/spec/:specId')
  remove(@Param('productId') productId: string) {
    return this.psValueService.removeAllValuesFromProduct(productId);
  }
}
