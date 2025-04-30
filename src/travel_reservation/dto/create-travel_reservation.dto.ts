import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { TravelType } from 'src/users/utility/common/travel.type.enum';

export class CreateTravelReservationDto {
    @IsEnum(TravelType)
    type: TravelType;

    @IsString()
    @IsNotEmpty()
    destination: string;

    @IsString()
    @IsNotEmpty()
    departureLocation: string;

    @IsDateString()
    departureDate: Date;

    @IsOptional()
    @IsDateString()
    returnDate?: Date;

    @IsUUID()
    providerId: string;
}
