import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UsePipes,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { ShipmentTrackingService } from './shipment-tracking.service';
import { CreateShipmentTrackingDto } from './dto/create-shipment-tracking.dto';
import { UpdateShipmentTrackingDto } from './dto/update-shipment-tracking.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';

@Controller('shipment-trackings')
@UsePipes(new ValidationPipe({ transform: true }))
export class ShipmentTrackingController {
  constructor(private readonly trackingService: ShipmentTrackingService) {}

  @Post()
  @UseGuards(AuthentificationGuard)
  create(@Body() dto: CreateShipmentTrackingDto) {
    return this.trackingService.create(dto);
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  findAll() {
    return this.trackingService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.trackingService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  update(@Param('id') id: string, @Body() dto: UpdateShipmentTrackingDto) {
    return this.trackingService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthentificationGuard)
  remove(@Param('id') id: string) {
    return this.trackingService.remove(id);
  }

  @Get('track/:trackingNumber')
  async track(@Param('trackingNumber') trackingNumber: string) {
    return this.trackingService.trackByNumber(trackingNumber);
  }
}
