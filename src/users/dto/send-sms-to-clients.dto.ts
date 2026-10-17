import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsBoolean,
    IsUUID,
    IsIn,
    IsInt,
    Min,
    Max,
    IsDateString,
    MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SendSmsToClientsDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(500, {
        message: 'Le message ne doit pas dépasser 500 caractères',
    })
    message: string;

    @IsOptional()
    @IsIn(['SHIPMENT', 'ORDER', 'VEHICLE_RESERVATION', 'HOTEL_RESERVATION'], {
        message:
            'type doit être SHIPMENT, ORDER, VEHICLE_RESERVATION ou HOTEL_RESERVATION',
    })
    type?: 'SHIPMENT' | 'ORDER' | 'VEHICLE_RESERVATION' | 'HOTEL_RESERVATION';

    @IsOptional()
    @IsString()
    shippingCompanyId?: string;

    @IsOptional()
    @IsString()
    city?: string;

    @IsOptional()
    @IsString()
    country?: string;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsUUID('4', { message: 'userId doit être un UUID valide' })
    userId?: string;

    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    sendToAll?: boolean;

    @IsOptional()
    @IsDateString({}, { message: 'startDate doit être une date ISO valide' })
    startDate?: string;

    @IsOptional()
    @IsDateString({}, { message: 'endDate doit être une date ISO valide' })
    endDate?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    batchSize?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    delayBetweenBatchesMs?: number;
}