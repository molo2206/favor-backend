import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class StartTrackingDto {
    @Type(() => Number)
    @IsNumber()
    @Min(-90)
    @Max(90)
    latitude: number;

    @Type(() => Number)
    @IsNumber()
    @Min(-180)
    @Max(180)
    longitude: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    speed?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @Max(360)
    heading?: number;
}