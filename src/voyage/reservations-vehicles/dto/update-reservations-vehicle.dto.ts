import { PartialType } from '@nestjs/swagger';
import { CreateReservationDto } from './create-reservations-vehicle.dto';

export class UpdateReservationsVehicleDto extends PartialType(CreateReservationDto) {}
