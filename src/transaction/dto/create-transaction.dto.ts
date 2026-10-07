// src/transaction/dto/create-transaction.dto.ts
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { TransactionStatus } from '../enum/transaction.status.enum';

export class CreateTransactionDto {
  @IsNumber()
  debit: number;

  @IsNumber()
  credit: number;

  @IsString()
  designation: string;

  @IsEnum(TransactionStatus)
  @IsOptional()
  status?: TransactionStatus;

  @IsUUID()
  @IsOptional()
  orderId?: string;

  @IsUUID()
  @IsOptional()
  shipmentId?: string;
}
