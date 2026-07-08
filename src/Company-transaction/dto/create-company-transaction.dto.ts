// src/company/dto/create-company-transaction.dto.ts
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  IsBoolean,
  IsNotEmpty,
} from 'class-validator';
import { TransactionStatus, TransactionType } from '../entity/company-transaction.entity';
import { FeeBasis, FeeType } from 'src/company/entities/company.entity';

export class CreateCompanyTransactionDto {
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsEnum(TransactionType)
  type: TransactionType;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @IsOptional()
  @IsString()
  referenceType?: string;

  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsEnum(FeeBasis)
  feeBasis?: FeeBasis;

  @IsOptional()
  @IsEnum(FeeType)
  feeType?: FeeType;

  @IsOptional()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @IsOptional()
  @IsUUID()
  shipmentId?: string;

  @IsOptional()
  @IsUUID()
  ltaId?: string;
}