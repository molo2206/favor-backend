import { Controller, Post, Body, Param, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { RoomAvailabilityService } from './room-availability.service';
import { UpdateRoomAvailabilityDto } from './dto/update-room-availability.dto';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { CreateRoomAvailabilityDto } from './dto/create-room-availability-dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { SearchRoomsDto } from './dto/search-room-dtod';
import { Product } from 'src/products/entities/product.entity';

@Controller('booking')
export class RoomAvailabilityController {
  constructor(private readonly service: RoomAvailabilityService) {}

  @Post('availability')
  create(@Body() dto: CreateRoomAvailabilityDto) {
    return this.service.create(dto);
  }

  @Patch('availability/:id')
  update(@Param('id') id: string, @Body() dto: UpdateRoomAvailabilityDto) {
    return this.service.update(id, dto);
  }

  @Get('availability/:productId')
  findRange(
    @Param('productId') productId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.findForProductBetween(productId, from, to);
  }

  @Post('availability/generate')
  generateCalendar(@Body() body: { productId: string; from: string; to: string }) {
    return this.service.generateCalendar(body.productId, body.from, body.to);
  }

  @UseGuards(AuthentificationGuard)
  @Post('room')
  reserve(@CurrentUser() user: UserEntity, @Body() body: CreateReservationDto) {
    return this.service.reserveRoom(user.id, body);
  }

  @Get('search')
  async searchProducts(
    @Query('destination') destination: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('rooms') rooms?: string,
    @Query('adults') adults?: string,
    @Query('children') children?: string,
  ) {
    const roomsNumber = rooms ? parseInt(rooms, 10) : undefined;
    const adultsNumber = adults ? parseInt(adults, 10) : 1; 
    const childrenNumber = children ? parseInt(children, 10) : 0; // valeur par défaut 0 enfant

    const result = await this.service.searchProductsByDestination({
      destination,
      startDate,
      endDate,
      rooms: roomsNumber,
      adults: adultsNumber,
      children: childrenNumber,
    });

    return result;
  }
}
