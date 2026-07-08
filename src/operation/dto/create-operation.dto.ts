// src/operation/dto/create-operation.dto.ts
import { IsOptional, IsUUID, IsNumber, IsString, IsEnum } from 'class-validator';
import { OperationStatus } from '../enum/operation.status.enum';
import { PaymentMethod } from '../enum/payment-method.enum';

export class CreateOperationDto {
  @IsNumber()
  debit: number;

  @IsNumber()
  credit: number;

  @IsString()
  designation: string;

  @IsOptional()
  @IsEnum(OperationStatus)
  status?: OperationStatus;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  shipmentId?: string;

  @IsOptional()
  @IsUUID()
  reservationId?: string;        // voyage

  @IsOptional()
  @IsUUID()
  hotelReservationId?: string;    // hôtel

  @IsUUID()
  userId: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}