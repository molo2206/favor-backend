import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PosPaymentMethod } from '../enums/pos.enum';

export class CreateTerminalDto {
  @IsString() name: string;
  @IsString() code: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsBoolean() offlineEnabled?: boolean;
  @IsOptional() config?: Record<string, any>;
}

export class UpdateTerminalConfigDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsBoolean() offlineEnabled?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() config?: Record<string, any>;
}

export class OpenSessionDto {
  @IsString() terminalId: string;
  @IsOptional() @IsNumber() @Min(0) openingCash?: number;
  @IsOptional() @IsString() currency?: string;
}

export class CloseSessionDto {
  @IsNumber() @Min(0) countedCash: number;
}

export class SaleItemDto {
  @IsString() productId: string;
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() productName?: string;
  @IsNumber() @Min(0) unitPrice: number;
  @IsNumber() @Min(0.001) quantity: number;
}

export class SalePaymentDto {
  @IsEnum(PosPaymentMethod) method: PosPaymentMethod;
  @IsNumber() @Min(0) amount: number;
  @IsOptional() @IsString() reference?: string;
  /** Idempotence offline d'un règlement */
  @IsOptional() @IsString() clientOpId?: string;
}

export class CreateSaleDto {
  @IsString() sessionId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  /** Méthode principale si un seul règlement (ignoré si `payments` est fourni) */
  @IsOptional() @IsEnum(PosPaymentMethod) paymentMethod?: PosPaymentMethod;

  /** Règlements au moment de la vente (paiement multiple / acompte). Vide + onCredit = vente à crédit. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments?: SalePaymentDto[];

  /** Vente à crédit : rien (ou une partie) n'est versé, le client doit être identifié */
  @IsOptional() @IsBoolean() onCredit?: boolean;

  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsNumber() @Min(0) tax?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customerPhone?: string;
  @IsOptional() @IsBoolean() hasPrescription?: boolean;

  /** Idempotence (surtout offline) : si fourni et déjà vu, on renvoie la vente existante */
  @IsOptional() @IsString() clientOpId?: string;
  /** Horodatage réel sur la caisse (ISO) */
  @IsOptional() @IsString() soldAt?: string;
}

/** Règlement ajouté APRÈS la vente (solder un crédit / un reste dû) */
export class AddPaymentDto {
  @IsEnum(PosPaymentMethod) method: PosPaymentMethod;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() clientOpId?: string;
}

export class CreditsQueryDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() customerPhone?: string;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) limit?: number;
}

/** Créer / modifier un produit depuis la caisse (y compris hors-ligne, avec un id généré localement) */
export class UpsertProductDto {
  /** UUID généré par la caisse (recommandé offline) ; si absent, le serveur en crée un */
  @IsOptional() @IsString() id?: string;
  @IsString() name: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsNumber() @Min(0) detailPrice?: number;
  @IsOptional() @IsString() image?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() brandId?: string;

  /** Stock initial (types sans lot uniquement) */
  @IsOptional() @IsNumber() @Min(0) initialStock?: number;
  @IsOptional() @IsString() locationId?: string;

  // Métadonnées pharmacie (facultatives)
  @IsOptional() @IsBoolean() requiresPrescription?: boolean;
  @IsOptional() @IsBoolean() isControlled?: boolean;
  @IsOptional() @IsString() dci?: string;
  @IsOptional() @IsString() dosage?: string;
  @IsOptional() @IsInt() @Min(1) unitsPerPack?: number;
}

export class CatalogQueryDto {
  /** Synchro incrémentale : ne renvoyer que les produits modifiés depuis cette date ISO */
  @IsOptional() @IsString() updatedSince?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) limit?: number;
}

export class SalesQueryDto {
  @IsOptional() @IsString() sessionId?: string;
  @IsOptional() @IsString() terminalId?: string;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) limit?: number;
}
