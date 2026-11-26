import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { StockLocationType } from '../enums/inventory.enum';

export class CreateLocationDto {
  @IsString() name: string;
  @IsOptional() @IsEnum(StockLocationType) type?: StockLocationType;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsBoolean() isDefaultSale?: boolean;
}

/** Réception de stock (entrée). Un lot (numéro + péremption) si le type suit les lots. */
export class ReceiveStockDto {
  @IsString() productId: string;
  @IsString() locationId: string;
  @IsNumber() @IsPositive() quantity: number;

  // Lot (pharmacie / denrées)
  @IsOptional() @IsString() lotNumber?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsNumber() @Min(0) costPrice?: number;
  @IsOptional() @IsString() supplier?: string;

  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() reason?: string;
}

/** Sortie de stock (vente, consommation). FEFO automatique si lots suivis. */
export class ConsumeStockDto {
  @IsString() productId: string;
  @IsString() locationId: string;
  @IsNumber() @IsPositive() quantity: number;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() reason?: string;
  /** La vente présente-t-elle une ordonnance ? (requis pour les produits sur ordonnance) */
  @IsOptional() @IsBoolean() hasPrescription?: boolean;
}

/** Ajustement d'inventaire : fixe la quantité réelle constatée (perte, casse, comptage). */
export class AdjustStockDto {
  @IsString() productId: string;
  @IsString() locationId: string;
  @IsNumber() @Min(0) countedQuantity: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() lotId?: string;
}

export class TransferStockDto {
  @IsString() productId: string;
  @IsString() fromLocationId: string;
  @IsString() toLocationId: string;
  @IsNumber() @IsPositive() quantity: number;
  @IsOptional() @IsString() reason?: string;
}

export class StockQueryDto {
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsBoolean() lowStockOnly?: boolean;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) limit?: number;
}

export class ExpiringQueryDto {
  /** Fenêtre en jours (défaut 30) : lots périmant d'ici N jours */
  @IsOptional() @IsInt() @Min(1) days?: number;
  @IsOptional() @IsString() locationId?: string;
}
