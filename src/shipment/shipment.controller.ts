import {
  Controller,
  Post,
  Patch,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  ClassSerializerInterceptor,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { ShipmentService } from './shipment.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { ShipmentPriceDto } from './dto/createShipmentPrice.dto';

@Controller('shipments')
@UseInterceptors(ClassSerializerInterceptor)
export class ShipmentController {
  constructor(private readonly shipmentService: ShipmentService) {}

  @Post()
  @UseGuards(AuthentificationGuard)
  async createShipment(
    @Body() createShipmentDto: CreateShipmentDto,
    @CurrentUser() user: UserEntity,
  ) {
    const result = await this.shipmentService.create(createShipmentDto, user);
    return {
      message: result.message,
      data: result.data,
    };
  }

  @Get('my')
  @UseGuards(AuthentificationGuard)
  async findAllByUser(@CurrentUser() user: UserEntity) {
    const shipments = await this.shipmentService.findAllByUser(user.id);

    return {
      message: 'Vos shipments récupérés avec succès',
      data: shipments,
    };
  }

  @Patch(':id/prices')
  @UseGuards(AuthentificationGuard)
  async updateShipmentPrices(
    @Param('id') shipmentId: string,
    @Body() priceDto: ShipmentPriceDto,
  ): Promise<{ message: string; data: any }> {
    const result = await this.shipmentService.updateShipmentPrices(shipmentId, priceDto);
    if (!result) {
      throw new NotFoundException('Shipment not found');
    }
    return result;
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  async findAll() {
    const shipments = await this.shipmentService.findAll();
    return {
      message: 'Liste des shipments récupérée avec succès',
      data: shipments,
    };
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const shipment = await this.shipmentService.findOne(id);
    return {
      message: 'Shipment retrouvé avec succès',
      data: shipment,
    };
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateShipmentDto: UpdateShipmentDto,
  ) {
    const updatedShipment = await this.shipmentService.update(id, updateShipmentDto);
    return {
      message: 'Shipment mis à jour avec succès',
      data: updatedShipment,
    };
  }

  @Delete(':id')
  @UseGuards(AuthentificationGuard)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.shipmentService.remove(id);
    return {
      message: result.message,
    };
  }

  // Suivi par trackingNumber
  // @Get('track/:trackingNumber')
  // async trackShipment(@Param('trackingNumber') trackingNumber: string) {
  //   const shipment = await this.shipmentService.trackShipment(trackingNumber);
  //   return {
  //     message: 'Shipment retrouvé avec succès',
  //     data: shipment,
  //   };
  // }
}
