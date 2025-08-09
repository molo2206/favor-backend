import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ReservServiceService } from './reserv-service.service';
import { CreateReservServiceDto } from './dto/create-reserv-service.dto';
import { UpdateReservServiceDto } from './dto/update-reserv-service.dto';

@Controller('reserv-service')
export class ReservServiceController {
  constructor(private readonly reservServiceService: ReservServiceService) {}

  @Post()
  create(@Body() createReservServiceDto: CreateReservServiceDto) {
    return this.reservServiceService.create(createReservServiceDto);
  }

  @Get()
  findAll() {
    return this.reservServiceService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reservServiceService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateReservServiceDto: UpdateReservServiceDto) {
    return this.reservServiceService.update(+id, updateReservServiceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reservServiceService.remove(+id);
  }
}
