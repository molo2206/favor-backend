import {
  IsNotEmpty,
  IsString,
  IsUUID,
  IsEnum,
  IsDecimal,
  IsOptional,
} from 'class-validator';
import { PaymentStatus } from 'src/transaction/enum/payment.status.enum';
import { TransactionType } from '../transaction.enum';

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
  @IsEnum(TransactionType)
  type: TransactionType;

  @IsNotEmpty()
  @IsString()
  transactionReference: string; // Référence unique de la transaction (ID généré par un fournisseur de paiement)

  @IsNotEmpty()
  @IsString()
  currency: string; // Devise de la transaction, ex. 'USD', 'EUR', etc.
}
