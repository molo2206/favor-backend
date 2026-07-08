import { IsEnum } from 'class-validator';
import { ReservationStatus } from 'src/travel_reservation/enum/reservation.status.enum';

export class UpdateReservationStatusDto {
  @IsEnum(ReservationStatus, {
    message: `Le statut doit être l'une des valeurs suivantes : ${Object.values(ReservationStatus).join(', ')}`,
  })
  status: ReservationStatus;
}
