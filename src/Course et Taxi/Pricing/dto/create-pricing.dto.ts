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

  // ✅ commissionRate retiré : la commission se règle par véhicule
  //    (PATCH /driver-vehicles/:id/commission)

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
