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
import { Transform, Type } from 'class-transformer';

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
    @Transform(({ value }) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const v = value.toLowerCase();
        if (['true', '1', 'yes'].includes(v)) return true;
        if (['false', '0', 'no'].includes(v)) return false;
      }
      return value;
    })
    @IsBoolean()
    sendToAll?: boolean;

    @IsOptional()
    @IsDateString({}, { message: 'startDate doit être une date ISO valide' })
    startDate?: string;

    @IsOptional()
    @IsDateString({}, { message: 'endDate doit être une date ISO valide' })
    endDate?: string;

    // ✅ NOUVEAU
    @IsOptional()
    @Transform(({ value }) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const v = value.toLowerCase();
        if (['true', '1', 'yes'].includes(v)) return true;
        if (['false', '0', 'no'].includes(v)) return false;
      }
      return value;
    })
    @IsBoolean()
    onlySellers?: boolean;

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