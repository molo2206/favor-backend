import { IsNotEmpty, IsUUID, IsNumber, IsOptional } from 'class-validator';

export class CreateRideDto {
 
  @IsUUID()
  @IsOptional()
  driverId?: string;

  @IsUUID()
  @IsNotEmpty()
  cityId: string;

  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  @IsNotEmpty()
  pickupLocation: { lat: number; lng: number; address?: string; placeId?: string };

  @IsNotEmpty()
  dropoffLocation: { lat: number; lng: number; address?: string; placeId?: string };

  @IsNumber()
  @IsOptional()
  distance?: number;

  @IsNumber()
  @IsOptional()
  duration?: number;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsNumber()
  @IsOptional()
  surgeMultiplier?: number;
}
