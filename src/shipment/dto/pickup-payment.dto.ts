import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';

/**
 * ✅ Encaissement du ramassage d'un shipment — mêmes modes que les commandes/colis
 *    (CASH, MOBILE_MONEY, BANK, MANUAL, FPAY).
 */
export class CollectShipmentPickupPaymentDto {
  @IsEnum(PaymentMethod) method: PaymentMethod;

  /** F-Pay : token du portefeuille du payeur (obligatoire si method = FPAY) */
  @IsOptional() @IsString() access_token?: string;

  /** Mobile Money : opérateur et numéro */
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() phone?: string;

  /** Référence de la transaction (auto-remplie pour F-Pay) */
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}
