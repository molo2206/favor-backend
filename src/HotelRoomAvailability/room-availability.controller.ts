import { Controller, Post, Body, Param, Get, Patch, Query, Req } from '@nestjs/common';
import { RoomAvailabilityService } from './room-availability.service';
import { CreateRoomAvailabilityDto } from './dto/create-room-availability-dto';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';

@Controller('room')
export class RoomAvailabilityController {
  constructor(private readonly service: RoomAvailabilityService) {}

  // CREATE AVAILABILITY
  @Post('availability')
  create(@Body() dto: CreateRoomAvailabilityDto) {
    return this.service.create(dto);
  }

  // UPDATE AVAILABILITY
  @Patch('availability/:id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  // LIST AVAILABILITY FOR PRODUCT
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

  @Post('reserve')
  reserve(
    @CurrentUser() user: UserEntity,
    @Body()
    body: {
      productId: string;
      startDate: string;
      endDate: string;
      adults: number;
      children: number;
      roomsBooked: number;
    },
  ) {
    return this.service.reserveRoom(user.id, body);
  }
}
