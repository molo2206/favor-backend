import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { ReservationStatus } from '../enum/reservation-room.enum';

export class UpdateReservationStatusDto {
  @IsEnum(ReservationStatus, {
    message: `Le statut doit être l'un des suivants: ${Object.values(ReservationStatus).join(', ')}`,
  })
  @IsNotEmpty({ message: 'Le statut est obligatoire' })
  status: ReservationStatus;
}
