import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ShipmentStatus } from 'src/shipment/enum/shipment.dto';
import { CheckinStatus, TransferStatus } from '../enums/parcel-checkin.enum';

/** Un colis à envoyer : stockId, OU shipmentId / trackingNumber (cherché dans la branche de départ) */
export class TransferItemInputDto {
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

  /** Pièces envoyées (par défaut : tout le stock restant du colis dans la branche de départ) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;
}

/** Envoi de colis d'une branche vers une autre */
export class CreateTransferDto {
  @IsUUID()
  fromBranchId: string;

  @IsUUID()
  toBranchId: string;

  /** Colis à envoyer (ou ltaId pour envoyer tous les colis de la LTA en stock dans la branche) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => TransferItemInputDto)
  items?: TransferItemInputDto[];

  /** Envoyer tous les colis de cette LTA encore en stock dans la branche de départ */
  @IsOptional()
  @IsUUID()
  ltaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class TransferQueryDto {
  /** Branche concernée (obligatoire sauf admin) */
  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** OUT = envoyés par la branche, IN = à recevoir / reçus par la branche, ALL = les deux */
  @IsOptional()
  @IsIn(['IN', 'OUT', 'ALL'])
  direction?: 'IN' | 'OUT' | 'ALL';

  @IsOptional()
  @IsEnum(TransferStatus)
  status?: TransferStatus;

  /** Code du transfert ou numéro de suivi d'un colis */
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

export class CancelTransferDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason: string;
}

export class ReturnMissingDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Ouvrir le pointage de réception d'un transfert (branche d'arrivée) */
export class OpenTransferCheckinDto {
  @IsUUID()
  transferId: string;

  /** Statut à donner aux colis reçus, à la clôture (ex : ARRIVED_DESTINATION). Absent = inchangé */
  @IsOptional()
  @IsEnum(ShipmentStatus)
  shipmentStatus?: ShipmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Scan d'un colis pendant le pointage */
export class ScanParcelDto {
  /** Numéro de suivi scanné ou saisi */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  code: string;

  /** Pièces pointées (par défaut : toutes les pièces encore attendues pour ce colis) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  /** Colis abîmé / ouvert */
  @IsOptional()
  @IsBoolean()
  damaged?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Correction d'une ligne pointée */
export class UpdateCheckinItemDto {
  /** Nouvelle quantité pointée (0 = annuler le pointage du colis) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  checkedQty?: number;

  @IsOptional()
  @IsBoolean()
  damaged?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CloseCheckinDto {
  /** Remplace le statut choisi à l'ouverture (ex : ARRIVED_DESTINATION) */
  @IsOptional()
  @IsEnum(ShipmentStatus)
  shipmentStatus?: ShipmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CancelCheckinDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason: string;
}

export class CheckinQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  transferId?: string;

  @IsOptional()
  @IsEnum(CheckinStatus)
  status?: CheckinStatus;

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
