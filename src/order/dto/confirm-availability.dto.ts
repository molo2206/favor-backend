import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const CHOICES = ['AVAILABLE', 'UNAVAILABLE'];

/** Réponse pour une ligne de commande */
export class AvailabilityItemDto {
  @ApiPropertyOptional({ description: 'Id de la ligne de commande (order_items.id)' })
  @IsString()
  orderItemId: string;

  @ApiPropertyOptional({ enum: CHOICES })
  @IsIn(CHOICES)
  status: 'AVAILABLE' | 'UNAVAILABLE';

  @ApiPropertyOptional({ description: 'Remarque facultative' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * PATCH /orders/availability/:orderId
 *  - { "status": "AVAILABLE" }                     → tous MES produits de la commande sont disponibles
 *  - { "status": "UNAVAILABLE", "note": "..." }     → tous MES produits sont indisponibles
 *  - { "items": [{ "orderItemId": "...", "status": "AVAILABLE" }, { "orderItemId": "...", "status": "UNAVAILABLE" }] }
 */
export class ConfirmAvailabilityDto {
  @ApiPropertyOptional({ enum: CHOICES, description: 'Même réponse pour tous mes produits' })
  @IsOptional()
  @IsIn(CHOICES)
  status?: 'AVAILABLE' | 'UNAVAILABLE';

  @ApiPropertyOptional({ description: 'Remarque facultative' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ type: [AvailabilityItemDto], description: 'Une réponse par produit' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityItemDto)
  items?: AvailabilityItemDto[];
}
