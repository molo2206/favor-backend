import { IsNotEmpty, IsString, IsUUID, IsEnum, IsDecimal, IsOptional } from 'class-validator';
import { PaymentStatus } from 'src/users/utility/common/payment.status.enum';

export class CreateTransactionDto {
  @IsNotEmpty()
  @IsUUID()
  orderId: string;

  @IsNotEmpty()
  @IsDecimal()
  amount: number;

  @IsNotEmpty()
  @IsEnum(PaymentStatus)
  paymentStatus: PaymentStatus;

  @IsNotEmpty()
  @IsString()
  transactionReference: string; // Référence unique de la transaction (ID généré par un fournisseur de paiement)

  @IsOptional()
  @IsString()
  paymentMethod?: string; // Méthode de paiement : ex. "Carte de crédit", "PayPal", etc.

  @IsOptional()
  @IsString()
  paymentGateway?: string; // Passerelle de paiement : ex. "Stripe", "PayPal", etc.

  @IsNotEmpty()
  @IsString()
  currency: string; // Devise de la transaction, ex. 'USD', 'EUR', etc.
}
