import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsObject, IsString, Min, ValidateNested } from 'class-validator';

export enum SyncOpType {
  SALE = 'SALE',
  PAYMENT = 'PAYMENT', // règlement d'une vente à crédit / reste dû
  PRODUCT_UPSERT = 'PRODUCT_UPSERT', // création / modification d'un produit faite hors-ligne
  STOCK_IN = 'STOCK_IN',
  STOCK_OUT = 'STOCK_OUT',
}

export class SyncOperationDto {
  /** Identifiant unique de l'opération, généré par la caisse (idempotence) */
  @IsString() clientOpId: string;

  /** Séquence croissante par terminal (ordre d'application) */
  @IsInt() @Min(1) seq: number;

  /** SALE | STOCK_IN | STOCK_OUT */
  @IsString() type: string;

  /** Charge utile : pour SALE = CreateSaleDto (sans sessionId obligatoire si fourni ici), pour STOCK_* = ReceiveStockDto/ConsumeStockDto */
  @IsObject() payload: Record<string, any>;
}

export class SyncBatchDto {
  @IsString() terminalId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations: SyncOperationDto[];
}
