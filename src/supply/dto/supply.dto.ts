import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ShipmentStatus } from 'src/shipment/enum/shipment.dto';
import { SupplyStatus } from '../enums/supply.enum';

/** Créer les Supply d'une commande (un par vendeur / sous-commande) */
export class CreateSupplyFromOrderDto {
  @IsOptional()
  @IsUUID()
  originBranchId?: string;

  @IsOptional()
  @IsUUID()
  destinationBranchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/** Créer un Supply pour une sous-commande précise (ou une commande sans sous-commande) */
export class CreateSupplyDto extends CreateSupplyFromOrderDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  subOrderId?: string;
}

export class UpdateSupplyDto {
  @IsOptional()
  @IsUUID()
  originBranchId?: string;

  @IsOptional()
  @IsUUID()
  destinationBranchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/** Transformer la commande en shipment */
export class ConvertToShipmentDto {
  @IsOptional()
  @IsUUID()
  originBranchId?: string;

  @IsOptional()
  @IsUUID()
  destinationBranchId?: string;

  // ---------- Étapes ----------
  @IsOptional()
  @IsBoolean()
  pickupEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  shippingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  deliveryEnabled?: boolean;

  @IsOptional() @IsString() @MaxLength(255) pickupFrom?: string;
  @IsOptional() @IsString() @MaxLength(255) pickupTo?: string;
  @IsOptional() @IsString() @MaxLength(255) shippingFrom?: string;
  @IsOptional() @IsString() @MaxLength(255) shippingTo?: string;
  @IsOptional() @IsString() @MaxLength(255) deliveryFrom?: string;
  @IsOptional() @IsString() @MaxLength(255) deliveryTo?: string;

  @IsOptional() @IsUUID() pickupCompanyId?: string;
  @IsOptional() @IsUUID() shippingCompanyId?: string;
  @IsOptional() @IsUUID() deliveryCompanyId?: string;
  @IsOptional() @IsUUID() pickupTransportTypeId?: string;

  // ---------- Prix du transport ----------
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) pickupPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) shippingPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) deliveryPrice?: number;

  @IsOptional() @IsString() @MaxLength(50) paymentMethod?: string;

  @IsOptional() @IsBoolean() isPaid?: boolean;

  // ---------- Colis ----------
  /** Description (par défaut : la liste des articles de la commande) */
  @IsOptional() @IsString() @MaxLength(2000) description?: string;

  /** Nombre de pièces (par défaut : la somme des quantités commandées) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) weight?: number;
  @IsOptional() @IsString() @MaxLength(100) dimensions?: string;
  @IsOptional() @IsBoolean() fragile?: boolean;

  /** Valeur déclarée (par défaut : le montant de la commande / sous-commande) */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) value?: number;

  /** Statut initial du shipment (par défaut PENDING) */
  @IsOptional() @IsEnum(ShipmentStatus) status?: ShipmentStatus;

  /** Ajouter directement le shipment à une LTA */
  @IsOptional() @IsUUID() ltaId?: string;

  /** Générer le code PIN de retrait (par défaut : oui) */
  @IsOptional() @IsBoolean() generatePin?: boolean;

  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ChangeSupplyStatusDto {
  @IsEnum(SupplyStatus)
  status: SupplyStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class SupplyNoteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  note: string;
}

export class CancelSupplyDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class SupplyQueryDto {
  @IsOptional() @IsEnum(SupplyStatus) status?: SupplyStatus;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsUUID() shipmentId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  /** Référence Supply, n° de facture, n° de suivi, client */
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
