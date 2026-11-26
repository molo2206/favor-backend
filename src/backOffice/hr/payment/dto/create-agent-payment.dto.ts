import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsUUID,
  IsDateString,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentType } from '../enums/payment-type.enum';

/**
 * DTO pour déduire une avance d'un salaire.
 */
export class AdvanceDeductionDto {
  @IsUUID()
  advancePaymentId: string; // ID du paiement ADVANCE à déduire

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;
}

/**
 * DTO de création d'un paiement agent.
 * Correspond à l'entité AgentPaymentEntity.
 */
export class CreateAgentPaymentDto {
  // ============================================================
  // 🔗 RELATIONS
  // ============================================================
  @IsUUID()
  employeeId: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  paidById?: string;

  // ============================================================
  // 📌 TYPE DE PAIEMENT
  // ============================================================
  @IsEnum(PaymentType)
  type: PaymentType;

  // ============================================================
  // 💰 MONTANTS
  // ============================================================
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bonus?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deduction?: number;

  /**
   * ✅ Liste des avances à déduire de ce salaire.
   * Uniquement utilisé quand type = SALARY.
   * Le service calcule `advanceDeducted` à partir de cette liste.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdvanceDeductionDto)
  advancesToDeduct?: AdvanceDeductionDto[];

  @IsOptional()
  @IsString()
  currency?: string;

  // ============================================================
  // 🔗 RÉFÉRENCE POUR REMBOURSEMENT D'AVANCE
  // ============================================================
  @IsOptional()
  @IsUUID()
  relatedPaymentId?: string;

  // ============================================================
  // 📅 PÉRIODES & MÉTHODES
  // ============================================================
  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  // ============================================================
  // 📝 DÉTAILS
  // ============================================================
  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}