// create-order.dto.ts
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from 'src/order-item/dto/create-order-item.dto';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { CompanyActivity } from 'src/company/enum/activity.company.enum';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';

export class CreateOrderDto {
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  totalAmount: number;

  @IsNotEmpty()
  addressUserId: string;

  @IsOptional()
  @IsEnum(CompanyType, {
    message: `Le type d'entreprise doit être l'une des valeurs suivantes : ${Object.values(CompanyType).join(', ')}`,
  })
  type?: CompanyType;

  @IsOptional()
  @IsEnum(CompanyActivity, {
    message: `Company activité doit être l'une des valeurs suivantes : ${Object.values(CompanyActivity).join(', ')}`,
  })
  shopType?: CompanyActivity;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsOptional()
  @IsString()
  whatsapp_number?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  orderItems: CreateOrderItemDto[];

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsEnum(PaymentMethod, {
    message: `paymentMethod doit être ${Object.values(PaymentMethod).join(', ')}`,
  })
  paymentMethod?: PaymentMethod;

  // Nouveaux champs
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  appliedFeeRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  grandTotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  transactionFee?: number;
}
