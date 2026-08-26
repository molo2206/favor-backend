// src/shipments/dto/collect-shipment-body.dto.ts
import { IsOptional, IsString, IsNumber, IsEnum, IsNotEmpty } from 'class-validator';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';

export class CollectShipmentBodyDto {
  @IsOptional()
  @IsString()
  deliveryFrom?: string;

  @IsOptional()
  @IsString()
  deliveryTo?: string;

  @IsOptional()
  @IsString()
  deliveryAddressId?: string;

  @IsOptional()
  @IsNumber()
  deliveryPrice?: number;

  @IsNumber()
  totalAmount: number;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  currency: string;

  @IsOptional()
  @IsString()
  provider: string;

  @IsOptional()
  @IsString()
  phone: string;

  // ✅ Ajout pour FPAY
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  pin?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Le token d\'accès FPay est requis pour le paiement FPAY' })
  access_token?: string;
}