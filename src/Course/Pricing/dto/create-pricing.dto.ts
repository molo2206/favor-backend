import { IsUUID, IsNumber, IsBoolean, IsOptional, Min } from 'class-validator';

export class CreatePricingDto {
  @IsUUID()
  cityId: string;

  @IsUUID()
  categoryId: string;

  @IsNumber()
  @Min(0)
  baseFare: number;

  @IsNumber()
  @Min(0)
  pricePerKm: number;

  @IsNumber()
  @Min(0)
  pricePerMinute: number;

  @IsNumber()
  @Min(0)
  minimumFare: number;

  @IsNumber()
  @Min(0)
  commissionRate: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
