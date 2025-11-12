import { IsEnum } from 'class-validator';
import { RentalStatus } from '../enum/rentalStatus.enum';

export class UpdateRentalContractStatusDto {
  @IsEnum(RentalStatus)
  status: RentalStatus;
}
