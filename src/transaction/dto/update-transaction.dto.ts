// src/transaction/dto/update-transaction.dto.ts
import { IsEnum } from 'class-validator';
import { TransactionStatus } from '../enum/transaction.status.enum';

export class UpdateTransactionDto {
  @IsEnum(TransactionStatus)
  status: TransactionStatus;
}
