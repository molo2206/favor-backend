import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Super-admin : configurer le tarif du contrôle technique */
export class ConfigureTechnicalControlTariffDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

/** Créer une demande de contrôle technique pour un véhicule */
export class CreateTechnicalControlDto {
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @IsOptional()
  @IsString()
  controlDate?: string;
}

/** Initier le paiement d'un contrôle technique */
export class PayTechnicalControlDto {
  /** Mode de paiement enregistré du payeur (UserPaymentMethod.id) */
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  /** Ou mode de paiement direct (FPAY / MOBILE_MONEY / CASH) */
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}

/** Confirmation de paiement (appelée par le mécanisme de paiement / F-Pay, ou admin) */
export class ConfirmTechnicalControlPaymentDto {
  @IsString()
  @IsNotEmpty()
  reference: string;

  @IsOptional()
  @IsString()
  providerReference?: string;
}

/** Finaliser le contrôle (agent/admin) : validation ou rejet */
export class CompleteTechnicalControlDto {
  @IsIn(['VALIDATED', 'REJECTED'])
  decision: 'VALIDATED' | 'REJECTED';

  @IsOptional()
  @IsString()
  generalState?: string;

  @IsOptional()
  results?: any;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsArray()
  documents?: string[];

  /** Date d'expiration / prochaine échéance (AAAA-MM-JJ) */
  @IsOptional()
  @IsString()
  expiryDate?: string;

  /** Exception admin tracée : valider sans paiement confirmé */
  @IsOptional()
  @IsString()
  paymentWaivedReason?: string;
}

/** Renouveler le contrôle technique d'un véhicule (conserve l'historique) */
export class RenewTechnicalControlDto {
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @IsOptional()
  @IsString()
  controlDate?: string;
}
