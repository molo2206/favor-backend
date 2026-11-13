// seats.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
  Query,
} from '@nestjs/common';
import { SeatsService } from './seats.service';
import { CreateSeatDto, CreateManySeatsDto } from './dto/create-seat.dto';
import { UpdateSeatDto } from './dto/update-seat.dto';
import { VehicleSeat } from './entities/seat.entity';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { Public } from 'src/users/utility/decorators/public.decorator';

@Controller('seats')
export class SeatsController {
  constructor(private readonly seatsService: SeatsService) {}

  @Post()
  @UseGuards(AuthentificationGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createDto: CreateSeatDto,
  ): Promise<{ message: string; data: VehicleSeat }> {
    const data = await this.seatsService.create(createDto);
    return { message: 'Siège créé avec succès', data };
  }

  @Post('many')
  @UseGuards(AuthentificationGuard)
  @HttpCode(HttpStatus.CREATED)
  async createMany(
    @Body() createManyDto: CreateManySeatsDto,
  ): Promise<{ message: string; data: VehicleSeat[] }> {
    const data = await this.seatsService.createMany(createManyDto);
    return { message: `${data.length} sièges créés avec succès`, data };
  }

  @Post('generate/:vehicleId')
  @HttpCode(HttpStatus.CREATED)
  async generateSeats(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query('totalSeats') totalSeats: string,
  ): Promise<{ message: string; data: VehicleSeat[] }> {
    const data = await this.seatsService.generateSeatsForVehicle(
      vehicleId,
      parseInt(totalSeats, 10),
    );
    return { message: `${data.length} sièges générés avec succès`, data };
  }

  @Get('vehicle/:vehicleId')
  async findByVehicle(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ): Promise<{ message: string; data: VehicleSeat[] }> {
    const data = await this.seatsService.findAllByVehicle(vehicleId);
    return { message: 'Liste des sièges du véhicule', data };
  }

  @Get('vehicle/:vehicleId/available')
  async getAvailableSeats(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query('reservationIds') reservationIds?: string,
  ): Promise<{ message: string; data: VehicleSeat[] }> {
    const ids = reservationIds ? reservationIds.split(',') : undefined;
    const data = await this.seatsService.getAvailableSeats(vehicleId, ids);
    return { message: 'Sièges disponibles', data };
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  async findAll(): Promise<{ message: string; data: VehicleSeat[] }> {
    const data = await this.seatsService.findAll();
    return { message: 'Liste de tous les sièges', data };
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string; data: VehicleSeat }> {
    const data = await this.seatsService.findOne(id);
    return { message: 'Siège trouvé', data };
  }

  @Get('vehicle/:vehicleId/seat/:seatNumber')
  @Public()
  async findByVehicleAndSeatNumber(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Param('seatNumber') seatNumber: string,
  ): Promise<{ message: string; data: VehicleSeat }> {
    const data = await this.seatsService.findByVehicleAndSeatNumber(
      vehicleId,
      seatNumber,
    );
    return { message: 'Siège trouvé', data };
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateSeatDto,
  ): Promise<{ message: string; data: VehicleSeat }> {
    const data = await this.seatsService.update(id, updateDto);
    return { message: 'Siège mis à jour', data };
  }

  @Delete(':id')
  @UseGuards(AuthentificationGuard)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.seatsService.remove(id);
    return { message: 'Siège supprimé avec succès' };
  }

  @Delete('vehicle/:vehicleId')
  @HttpCode(HttpStatus.OK)
  async removeAllByVehicle(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ): Promise<{ message: string }> {
    await this.seatsService.removeAllByVehicle(vehicleId);
    return { message: 'Tous les sièges du véhicule ont été supprimés' };
  }
}
