import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ShipmentStatus } from 'src/shipment/enum/shipment.dto';
import { BranchMovementType, BranchStockStatus } from '../enums/branch-stock.enum';

/** Réception d'un colis dans une branche (approvisionnement) */
export class ReceiveParcelDto {
  @IsUUID()
  branchId: string;

  /** shipmentId OU trackingNumber */
  @IsOptional()
  @IsUUID()
  shipmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  trackingNumber?: string;

  /** Pièces reçues (par défaut : toutes les pièces du colis) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsUUID()
  ltaId?: string;

  /** Emplacement dans le dépôt */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  /** Nouveau statut du shipment (ex : ARRIVED_DESTINATION). Absent = statut inchangé */
  @IsOptional()
  @IsEnum(ShipmentStatus)
  shipmentStatus?: ShipmentStatus;

  /** Autoriser plus de pièces que prévu sur le colis */
  @IsOptional()
  @IsBoolean()
  allowExcess?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Réception de tous les colis d'une LTA dans une branche */
export class ReceiveLtaDto {
  @IsUUID()
  branchId: string;

  @IsUUID()
  ltaId: string;

  @IsOptional()
  @IsEnum(ShipmentStatus)
  shipmentStatus?: ShipmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Retrait d'un colis par le client */
export class WithdrawParcelDto {
  /** stockId, OU shipmentId / trackingNumber (+ branchId si le colis est dans plusieurs branches) */
  @IsOptional()
  @IsUUID()
  stockId?: string;

  @IsOptional()
  @IsUUID()
  shipmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  trackingNumber?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Pièces retirées (par défaut : tout le stock restant) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  recipientPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Diminution manuelle (perte, casse, retour fournisseur…) */
export class DecreaseStockDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Inventaire : quantité réellement comptée dans la branche */
export class AdjustStockDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  countedQuantity: number;

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class SetLocationDto {
  @IsString()
  @MaxLength(100)
  location: string;
}

export class StockQueryDto {
  @IsOptional()
  @IsEnum(BranchStockStatus)
  status?: BranchStockStatus;

  /** true = seulement les colis encore en stock */
  @IsOptional()
  @IsString()
  available?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class MovementQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  shipmentId?: string;

  @IsOptional()
  @IsUUID()
  stockId?: string;

  @IsOptional()
  @IsEnum(BranchMovementType)
  type?: BranchMovementType;

  /** IN = entrées, OUT = sorties */
  @IsOptional()
  @IsString()
  direction?: 'IN' | 'OUT';

  /** AAAA-MM-JJ */
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
