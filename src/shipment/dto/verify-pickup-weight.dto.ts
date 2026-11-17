import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

/** ✅ Le livreur (ou admin) constate le poids réel au ramassage. */
export class VerifyPickupWeightDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) verifiedWeight: number;
}
