// update-exchange-rate.dto.ts
import { IsOptional, IsString, IsNumber, IsBoolean, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateExchangeRateDto {
  @ApiProperty({ example: 'USD', description: 'Devise', required: false })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ example: 2900, description: 'Taux de change', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @ApiProperty({ example: true, description: 'Statut', required: false })
  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @ApiProperty({ example: false, description: 'Supprimé', required: false })
  @IsOptional()
  @IsBoolean()
  deleted?: boolean;
}