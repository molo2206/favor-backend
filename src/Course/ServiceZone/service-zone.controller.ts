import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
} from '@nestjs/common';
import { CreateServiceZoneDto } from './dto/create-service-zone.dto';
import { UpdateServiceZoneDto } from './dto/update-service-zone.dto';
import { ServiceZonesService } from './service-zone.service';

@Controller('service-zones')
export class ServiceZonesController {
  constructor(private readonly service: ServiceZonesService) {}

  @Post()
  create(@Body() dto: CreateServiceZoneDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('check')
  checkLocation(
    @Query('lat') lat: number,
    @Query('lng') lng: number,
  ) {
    return this.service.findZoneByLocation(Number(lat), Number(lng));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateServiceZoneDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
