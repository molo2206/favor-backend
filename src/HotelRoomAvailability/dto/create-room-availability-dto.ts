import { IsUUID, IsDateString, IsInt, Min } from 'class-validator';

export class CreateRoomAvailabilityDto {
  @IsUUID()
  productId: string; // l'id du Product (type de chambre)

  @IsDateString()
  date: string;

  @IsInt()
  @Min(0)
  roomsAvailable: number;
}
