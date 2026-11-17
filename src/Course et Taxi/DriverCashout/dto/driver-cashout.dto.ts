import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

const CURRENCIES = ['USD', 'CDF', 'XAF', 'XOF'];
const upper = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const digits = ({ value }: { value: any }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value);

/** ✅ Demande de retrait des gains du chauffeur vers son Mobile Money (via F-Pay) */
export class DriverCashoutDto {
  /** Montant à retirer */
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  amount: number;

  /** Devise des gains à retirer */
  @Transform(upper) @IsIn(CURRENCIES)
  currency: string;

  /**
   * ✅ Destination : UNIQUEMENT le compte F-Pay du chauffeur (wallet F-Pay de la MÊME devise, créé s'il n'existe pas).
   */
  @IsOptional() @Transform(upper) @IsIn(['FPAY'])
  destination?: 'FPAY';

  /** ⚠️ Ignoré : F-Pay trouve le wallet du chauffeur grâce à son id F-Pay + la devise. Gardé pour les anciennes versions de l'app */
  @IsOptional() @IsString() @MaxLength(64)
  fpayWalletId?: string;

  /** ⚠️ Ignoré (ancien retrait Mobile Money) — gardé pour ne pas refuser les anciennes versions de l'app */
  @IsOptional() @IsUUID()
  paymentMethodId?: string;

  /** Opérateur Mobile Money (VODACOM_MPESA_COD, AIRTEL_COD, ORANGE_COD…) */
  @IsOptional() @Transform(upper) @IsString() @MaxLength(60)
  provider?: string;

  /** Numéro Mobile Money (243970000000) */
  @IsOptional() @Transform(digits) @Matches(/^\d{9,15}$/)
  phone?: string;

  /** ✅ Clé d'idempotence (ou en-tête Idempotency-Key) : renvoyer la même clé ne crée jamais un 2e retrait */
  @IsOptional() @IsString() @MaxLength(80)
  requestId?: string;
}

/**
 * ✅ Résumé des gains du chauffeur, séparé par devise (GET /rides/driver/earnings/summary)
 *  tzOffset : décalage horaire du téléphone en minutes, comme new Date().getTimezoneOffset()
 *             (Goma / Lubumbashi UTC+2 → -120). Sert à calculer « aujourd'hui », « cette semaine », « ce mois ».
 */
export class DriverEarningsSummaryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(-840) @Max(840) tzOffset?: number;
  /** Une seule devise (sinon toutes) */
  @IsOptional() @Transform(upper) @IsIn(CURRENCIES) currency?: string;
}

export class DriverCashoutQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @Transform(upper) @IsIn(['PROCESSING', 'SUCCESS', 'FAILED', 'UNKNOWN']) status?: string;
  @IsOptional() @Transform(upper) @IsIn(CURRENCIES) currency?: string;
  /** Admin : un chauffeur */
  @IsOptional() @IsUUID() driverId?: string;
}

/** ✅ Admin : résultat vérifié dans F-Pay d'un retrait sans réponse (UNKNOWN) */
export class ResolveDriverCashoutDto {
  @Transform(upper) @IsIn(['SUCCESS', 'FAILED'])
  status: 'SUCCESS' | 'FAILED';

  /** Référence de la transaction trouvée dans F-Pay (si SUCCESS) */
  @IsOptional() @IsString() @MaxLength(100)
  fpayReference?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}
