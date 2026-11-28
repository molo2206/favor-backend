import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CompanyType } from 'src/company/enum/type.company.enum';

/** Créer / modifier un palier de taille */
export class UpsertSizeTierDto {
  /** Modèle concerné ; vide = tous les modèles de l'entreprise */
  @IsOptional() @IsString() productId?: string;
  /** Clé de mesure pour l'application automatique (ex. « longueur ») ; vide = palier manuel */
  @IsOptional() @IsString() measureKey?: string;
  @IsOptional() @Type(() => Number) @IsNumber() minValue?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxValue?: number;
  @IsString() label: string;
  @Type(() => Number) @IsNumber() @Min(0) surcharge: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Une ligne (un modèle) pour laquelle on veut un devis */
export class QuoteItemDto {
  @IsString() productId: string;
  @Type(() => Number) @IsNumber() @Min(0) basePrice: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) quantity?: number;
  /** Mesures du client : { "longueur": 170, "tour_taille": 95, … } */
  @IsOptional() @IsObject() measures?: Record<string, number>;
  /** Paliers manuels choisis par libellé (ex. ["XL"]) si measureKey non utilisé */
  @IsOptional() @IsArray() @IsString({ each: true }) tierLabels?: string[];
}

/** Devis d'une commande atelier (prix selon taille) + aperçu commission */
export class QuoteDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => QuoteItemDto)
  items: QuoteItemDto[];
  @IsOptional() @IsString() currency?: string;
}

/** Aperçu de la commission plateforme pour un montant de confection donné */
export class CommissionPreviewDto {
  @Type(() => Number) @IsNumber() @Min(0) confectionAmount: number;
  @IsOptional() @IsString() currency?: string;
}

/** Créer / modifier une règle de commission (back-office SUPER_ADMIN) */
export class UpsertCommissionDto {
  /** Entreprise ciblée ; vide = règle par TYPE */
  @IsOptional() @IsString() companyId?: string;
  /** Type ciblé (ex. ATELIER_COUTURE) ; vide = règle propre à une entreprise */
  @IsOptional() @IsEnum(CompanyType) companyType?: CompanyType;
  @Type(() => Number) @IsNumber() @Min(0) ratePercent: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minFee?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
