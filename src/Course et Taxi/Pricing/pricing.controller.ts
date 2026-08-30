import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Patch,
} from '@nestjs/common';
import { PricingService } from './pricing.service';
import { CreatePricingDto } from './dto/create-pricing.dto';
import { UpdatePricingDto } from './dto/update-pricing.dto';

@Controller('pricings')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post()
  create(@Body() dto: CreatePricingDto) {
    return this.pricingService.create(dto);
  }

  @Get()
  findAll() {
    return this.pricingService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pricingService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePricingDto) {
    return this.pricingService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pricingService.remove(id);
  }

  // Endpoint pour récupérer le tarif actif
  @Get('by-city-category/search')
  getPricing(
    @Query('cityId') cityId: string,
    @Query('categoryId') categoryId: string,
  ) {
    return this.pricingService.getPricing(cityId, categoryId);
  }
}
