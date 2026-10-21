// dto/update-vehicle.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateVehicleDto } from './create-vehicle.dto';
import { IsArray, IsEnum, IsOptional, IsString, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SeatType } from 'src/voyage/seats/enums/seat-type.enum';

class SeatItemDto {
    @IsString()
    seatNumber: string;

    @IsEnum(SeatType)
    seatType: SeatType;

    @IsOptional()
    @IsInt()
    @Min(1)
    order?: number;           // ✅ Ajout de l'ordre
}

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SeatItemDto)
    seats?: SeatItemDto[];
}