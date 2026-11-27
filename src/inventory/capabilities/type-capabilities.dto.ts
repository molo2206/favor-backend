import { IsArray, IsBoolean, IsOptional } from 'class-validator';

/**
 * Mise à jour de la configuration (capacités) d'un type d'entreprise.
 * Tous les champs sont facultatifs : ceux absents ne sont pas modifiés.
 * Passer `offlineAllowedOps: null` pour revenir au défaut du code pour ce champ.
 */
export class UpdateTypeConfigDto {
  @IsOptional() @IsBoolean() hasInventory?: boolean;
  @IsOptional() @IsBoolean() hasPOS?: boolean;
  @IsOptional() @IsBoolean() offlineEnabled?: boolean;
  @IsOptional() @IsBoolean() tracksLots?: boolean;
  @IsOptional() @IsBoolean() tracksExpiry?: boolean;
  @IsOptional() @IsBoolean() requiresPrescription?: boolean;
  @IsOptional() @IsBoolean() controlledRegister?: boolean;
  @IsOptional() @IsBoolean() sellByFraction?: boolean;
  @IsOptional() @IsBoolean() allowNegativeStock?: boolean;

  /** Liste des opérations autorisées hors-ligne : SALE, STOCK_OUT, STOCK_IN, PRICE_LOOKUP, PRESCRIPTION_SALE, PRODUCT_MANAGE */
  @IsOptional() @IsArray() offlineAllowedOps?: string[] | null;
}
