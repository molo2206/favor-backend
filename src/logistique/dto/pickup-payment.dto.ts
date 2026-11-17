import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';

/**
 * ✅ Encaissement du ramassage — mêmes modes que les commandes
 *    (CASH, MOBILE_MONEY, BANK, MANUAL, FPAY).
 */
export class CollectPickupPaymentDto {
  @IsEnum(PaymentMethod) method: PaymentMethod;

  /** F-Pay : token du portefeuille du payeur (obligatoire si method = FPAY) */
  @IsOptional() @IsString() access_token?: string;

  /** Mobile Money : opérateur (ORANGE, MTN, AIRTEL…) et numéro */
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() phone?: string;

  /** Référence de la transaction (reçu, id mobile money…) — auto-remplie pour F-Pay */
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}
