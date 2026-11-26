import { Type } from 'class-transformer';
import {
    IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf,
} from 'class-validator';
import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CensusChannel, CensusResult, CensusSource, CensusStatus, CensusType } from '../../common/enums/census.enum';

/**
 * ➕ Nouvelle fiche de recensement — toujours pour un client ou une entreprise EXISTANT(E) :
 *    CLIENT → userId obligatoire ; VENDOR → vendorCompanyId obligatoire.
 *    Nom, téléphone, e-mail, ville… sont repris de la plateforme (les champs ci-dessous servent à compléter).
 */
export class CreateCensusDto {
    @IsEnum(CensusType) type: CensusType;
    @ValidateIf((o) => o.type === CensusType.CLIENT) @IsUUID() userId?: string;
    @ValidateIf((o) => o.type === CensusType.VENDOR) @IsUUID() vendorCompanyId?: string;
    @IsOptional() @IsString() @MaxLength(150) fullName?: string;
    @IsOptional() @IsString() @MaxLength(150) businessName?: string;
    @IsOptional() @IsString() @MaxLength(30) phone?: string;
    @IsOptional() @IsString() @MaxLength(30) whatsapp?: string;
    @IsOptional() @IsEmail() @MaxLength(150) email?: string;
    @IsOptional() @IsUUID() cityId?: string;
    @IsOptional() @IsString() @MaxLength(150) district?: string;
    @IsOptional() @IsString() @MaxLength(255) address?: string;
    @IsOptional() @IsString() @MaxLength(150) activity?: string;
    @IsOptional() @IsString() usualProducts?: string;
    @IsOptional() @IsString() @MaxLength(100) frequency?: string;
    @IsOptional() @IsDateString() lastActivityAt?: string;
    @IsOptional() @IsString() inactiveReason?: string;
    @IsOptional() @IsString() needs?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) satisfaction?: number;
    @IsOptional() @IsBoolean() consent?: boolean;
    @IsOptional() @IsString() notes?: string;
    @IsOptional() @IsEnum(CensusSource) source?: CensusSource;
    @IsOptional() @IsEnum(CensusStatus) status?: CensusStatus;
    @IsOptional() @IsDateString() nextFollowUpAt?: string;
    @IsOptional() @IsUUID() assignedToId?: string;
    @IsOptional() @IsUUID() branchId?: string;
}

/** ✏️ Modifier une fiche (le client / l'entreprise de la fiche ne change pas) */
export class UpdateCensusDto extends PartialType(OmitType(CreateCensusDto, ['type', 'userId', 'vendorCompanyId'] as const)) { }

/** 🔎 Clients / entreprises existants à recenser */
export class QueryCandidatesDto {
    @IsOptional() @IsEnum(CensusType) type?: CensusType;
    @IsOptional() @IsString() search?: string;
    /** Sans activité depuis au moins N jours */
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) inactiveDays?: number;
    /** true = seulement ceux qui n'ont pas encore de fiche */
    @IsOptional() @IsString() withoutRecord?: string;
    @IsOptional() @IsString() cityId?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number = 20;
}

/** 📋 Liste / recherche */
export class QueryCensusDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number = 20;
    @IsOptional() @IsEnum(CensusType) type?: CensusType;
    @IsOptional() @IsEnum(CensusStatus) status?: CensusStatus;
    @IsOptional() @IsString() cityId?: string;
    @IsOptional() @IsString() assignedToId?: string;
    @IsOptional() @IsString() search?: string;
    /** true = seulement les fiches à relancer aujourd'hui (ou en retard) */
    @IsOptional() @IsString() due?: string;
    /** Inactifs depuis au moins N jours (dernière activité) */
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) inactiveDays?: number;
}

/** 📞 Enregistrer une relance */
export class CreateFollowupDto {
    @IsOptional() @IsEnum(CensusChannel) channel?: CensusChannel;
    @IsEnum(CensusResult) result: CensusResult;
    @IsOptional() @IsString() note?: string;
    @IsOptional() @IsDateString() nextFollowUpAt?: string;
}

/** 📥 Créer les fiches des anciens clients / vendeurs de la plateforme */
export class ImportInactiveDto {
    @IsEnum(CensusType) type: CensusType;
    /** Sans activité depuis au moins N jours (défaut 90) */
    @IsOptional() @Type(() => Number) @IsInt() @Min(7) inactiveDays?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) limit?: number;
    @IsOptional() @IsString() cityId?: string;
    @IsOptional() @IsUUID() assignedToId?: string;
}
