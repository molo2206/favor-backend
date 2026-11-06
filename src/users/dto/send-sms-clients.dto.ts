import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class SendSmsToClientsDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    message: string;

    @IsOptional()
    @IsString()
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
    @IsInt()
    @Min(1)
    @Max(50)
    batchSize?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(5000)
    delayBetweenBatchesMs?: number;
}