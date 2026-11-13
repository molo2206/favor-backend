import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import { OwnerPaymentMethodType } from '../enum/owner-payment-method.enum';

/**
 * ✅ Un mode de paiement accepté par le propriétaire du véhicule.
 *  Détail requis selon le type :
 *   - MOBILE_MONEY → mobileMoneyNumber
 *   - BANK         → bankAccountNumber
 *   - FPAY         → fpayNumber
 *   - CASH         → aucun détail
 */
export class OwnerPaymentMethodDto {
  @IsEnum(OwnerPaymentMethodType)
  type: OwnerPaymentMethodType;

  @ValidateIf((o) => o.type === OwnerPaymentMethodType.MOBILE_MONEY)
  @IsString()
  mobileMoneyNumber?: string;

  @ValidateIf((o) => o.type === OwnerPaymentMethodType.BANK)
  @IsString()
  bankAccountNumber?: string;

  @ValidateIf((o) => o.type === OwnerPaymentMethodType.FPAY)
  @IsString()
  fpayNumber?: string;

  @IsOptional()
  @IsString()
  label?: string;
}
