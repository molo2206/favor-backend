// create-cancel-order.dto.ts
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}