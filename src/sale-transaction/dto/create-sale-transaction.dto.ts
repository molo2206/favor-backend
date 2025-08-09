import { IsNumber, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSaleTransactionDto {
  @IsUUID()
  vehicleId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity?: number;
}
