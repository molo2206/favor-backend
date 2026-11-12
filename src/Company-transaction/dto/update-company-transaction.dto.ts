// src/company/dto/update-company-transaction.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateCompanyTransactionDto } from './create-company-transaction.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { TransactionStatus } from '../entity/company-transaction.entity';

export class UpdateCompanyTransactionDto extends PartialType(
  CreateCompanyTransactionDto,
) {
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;
}
