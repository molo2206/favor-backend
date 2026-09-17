// create-exchange-rate.dto.ts
import { IsNotEmpty, IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateExchangeRateDto {
  @ApiProperty({ example: 'USD', description: 'Devise' })
  @IsNotEmpty()
  @IsString()
  currency: string;

  @ApiProperty({ example: 2850, description: 'Taux de change' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  value: number;

  @ApiProperty({ example: true, description: 'Statut', required: false })
  @IsOptional()
  @IsBoolean()
  status?: boolean;
}