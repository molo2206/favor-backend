import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { InternalTransferStatus } from '../../common/logistics.enums';

export class TransferItemInputDto {
  /** Ligne de stock de la branche d'origine… */
  @IsOptional() @IsUUID() stockId?: string;
  /** …ou le shipment / n° de suivi présent dans la branche d'origine */
  @IsOptional() @IsUUID() shipmentId?: string;
  @IsOptional() @IsString() @MaxLength(100) trackingNumber?: string;

  /** Pièces à transférer (par défaut : tout le stock disponible) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;

  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CreateTransferDto {
  @IsUUID() fromBranchId: string;
  @IsUUID() toBranchId: string;
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsDateString() plannedDepartureAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferItemInputDto)
  items: TransferItemInputDto[];
}

export class UpdateTransferDto {
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsDateString() plannedDepartureAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;

  /** Remplace toutes les lignes (brouillon uniquement) */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferItemInputDto)
  items?: TransferItemInputDto[];
}

export class DispatchTransferDto {
  /** Créer et démarrer une mission pour le véhicule (par défaut : oui si véhicule) */
  @IsOptional() @IsBoolean() createMission?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) startMileage?: number;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ReceiveTransferItemDto {
  @IsUUID() itemId: string;
  @Type(() => Number) @IsInt() @Min(0) receivedQuantity: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ReceiveTransferDto {
  /** Absent : tout est reçu. Sinon quantités reçues par ligne. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveTransferItemDto)
  items?: ReceiveTransferItemDto[];

  @IsOptional() @IsString() @MaxLength(100) location?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) endMileage?: number;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class CancelTransferDto {
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

export class TransferQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  /** Transferts au départ OU à l'arrivée de cette branche */
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() fromBranchId?: string;
  @IsOptional() @IsUUID() toBranchId?: string;
  @IsOptional() @IsEnum(InternalTransferStatus) status?: InternalTransferStatus;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
