import { IsUUID} from 'class-validator';

export class CreateSaleTransactionDto {
  @IsUUID()
  vehicleId: string;
}
