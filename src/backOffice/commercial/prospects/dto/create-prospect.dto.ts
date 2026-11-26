import {
    ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ProspectStatus } from '../../common/enums/prospect-status.enum';
import { ProspectSocialNetwork } from '../../common/enums/prospect-tracking.enum';

/** "fr, sw" ou ["fr","sw"] → ["fr","sw"] */
const toList = ({ value }: { value: any }) =>
    value === undefined || value === null
        ? value
        : (Array.isArray(value) ? value : String(value).split(','))
              .map((v: any) => String(v).trim())
              .filter(Boolean);

export class CreateProspectDto {
    @IsString() fullName: string;
    @IsOptional() @IsString() companyName?: string;
    @IsOptional() @IsEmail() email?: string;
    @IsOptional() @IsString() phone?: string;
    @IsOptional() @IsString() address?: string;
    @IsOptional() @IsString() sector?: string;
    @IsOptional() @IsString() source?: string;
    @IsOptional() @IsString() identifiedNeed?: string;
    @IsOptional() @IsString() productInterest?: string;
    @IsOptional() @Type(() => Number) @IsNumber() estimatedBudget?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) conversionProbability?: number;
    @IsOptional() @IsEnum(ProspectStatus) status?: ProspectStatus;
    @IsOptional() @IsString() assignedToId?: string;
    @IsOptional() @IsString() companyId?: string;
    @IsOptional() @IsString() branchId?: string;
    @IsOptional() @IsString() nextAction?: string;
    /** ✅ Date de la prochaine action (ISO, ex. 2026-11-12T10:00:00) — null pour l'effacer */
    @IsOptional() @IsDateString() nextActionAt?: string | null;
    /** ✅ Date du dernier contact */
    @IsOptional() @IsDateString() lastContactAt?: string | null;

    // ============================================================
    // ✅ Nouveaux champs
    // ============================================================
    /** Pays (table countries) */
    @IsOptional() @IsUUID() countryId?: string;
    /** Ville du pays choisi (table cities) */
    @IsOptional() @IsUUID() cityId?: string;
    /** Source « Réseau social » : FACEBOOK | TIKTOK | INSTAGRAM | WHATSAPP | LINKEDIN | OTHER */
    @IsOptional() @IsEnum(ProspectSocialNetwork) socialNetwork?: ProspectSocialNetwork;
    /** Réseau « Autres » : nom précisé */
    @IsOptional() @IsString() @MaxLength(100) socialNetworkOther?: string;
    /** Langue(s) parlée(s) */
    @IsOptional() @Transform(toList) @IsArray() @ArrayMaxSize(15) @IsString({ each: true }) @MaxLength(50, { each: true }) languages?: string[];
    /** Motif quand le prospect est rejeté / non intéressé (LOST) */
    @IsOptional() @IsString() @MaxLength(500) lostReason?: string;

    /** ✅ Doublons : true = enregistrer quand même alors que la personne a déjà un compte (le prospect y est rattaché) */
    @IsOptional() @IsBoolean() confirmExistingAccount?: boolean;
    /** ✅ Doublons : true = enregistrer quand même alors qu'un prospect avec ce téléphone / e-mail existe déjà */
    @IsOptional() @IsBoolean() allowDuplicateProspect?: boolean;
}
