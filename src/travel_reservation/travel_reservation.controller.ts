import {
  Controller,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
  ParseUUIDPipe,
  Get,
} from '@nestjs/common';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { TravelReservationService } from './travel_reservation.service';
import { CreateTravelReservationDto } from './dto/create-travel_reservation.dto';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UpdateReservationStatusDto } from './dto/update-travel_reservation.dto';
import { TravelReservationEntity } from './entities/travel_reservation.entity';

@Controller('travel')
@UseGuards(AuthentificationGuard)
export class TravelReservationController {
  constructor(
    private readonly reservationService: TravelReservationService,
  ) {}

  @Post()
  async createReservation(
    @CurrentUser() currentUser: UserEntity, 
    @Body() dto: CreateTravelReservationDto,
  ): Promise<{ data: TravelReservationEntity }> 
  {
    const reservation = await this.reservationService.createReservation(currentUser.id, dto);
    return { data: reservation };
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReservationStatusDto,
  ): Promise<{ data: TravelReservationEntity }> {
    const updated = await this.reservationService.updateStatus(id, dto.status);
    return { data: updated };
  }
  
  @Get('me')
  async getMyReservations(
    @CurrentUser() currentUser: UserEntity,
  ): Promise<{ data: TravelReservationEntity[] }> {
    const reservations = await this.reservationService.getReservationsForClient(currentUser.id);
    return { data: reservations };
  }
}
