import { IsNumber, IsUUID, Min } from 'class-validator';

export class CreateSaleTransactionDto {
  @IsUUID()
  vehicleId: string;
  @IsNumber()
  @Min(1)
  quantity?: number;
}
