import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ProspectStatus } from '../../common/enums/prospect-status.enum';
import { ProspectHistoryAction } from '../../common/enums/prospect-tracking.enum';

/** Assigner / transférer un prospect (toUserId vide = retirer le responsable) */
export class AssignProspectDto {
    @IsOptional() @IsUUID() toUserId?: string | null;
    @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class BulkAssignProspectsDto {
    @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true }) prospectIds: string[];
    @IsOptional() @IsUUID() toUserId?: string | null;
    @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/** Vérifier si une personne a déjà un compte / un prospect / une fiche client */
export class CheckProspectDuplicatesDto {
    @IsOptional() @IsString() @MaxLength(40) phone?: string;
    @IsOptional() @IsEmail() email?: string;
    @IsOptional() @IsString() @MaxLength(255) fullName?: string;
    /** Prospect à ignorer (modification) */
    @IsOptional() @IsUUID() excludeProspectId?: string;
}

export class LinkProspectAccountDto {
    /** Compte à rattacher (sinon : compte trouvé par téléphone / e-mail) */
    @IsOptional() @IsUUID() userId?: string;
}

/** Filtres communs du tableau de bord */
export class ProspectPerformanceQueryDto {
    @IsOptional() @IsString() agentId?: string;
    @IsOptional() @IsString() startDate?: string;
    @IsOptional() @IsString() endDate?: string;
    @IsOptional() @IsString() countryId?: string;
    @IsOptional() @IsString() cityId?: string;
    @IsOptional() @IsEnum(ProspectStatus) status?: ProspectStatus;
    @IsOptional() @IsString() source?: string;
    @IsOptional() @IsString() companyId?: string;
    /** Regroupement de l'évolution : day | week | month | year */
    @IsOptional() @IsIn(['day', 'week', 'month', 'year']) period?: 'day' | 'week' | 'month' | 'year';
    /** Nombre d'agents dans le classement (défaut 10) */
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) top?: number;
}

export class ProspectAssignmentsQueryDto {
    /** Assignations faites PAR cet agent */
    @IsOptional() @IsString() assignedById?: string;
    /** Prospects reçus par cet agent */
    @IsOptional() @IsString() toUserId?: string;
    /** Prospects retirés à cet agent */
    @IsOptional() @IsString() fromUserId?: string;
    @IsOptional() @IsString() prospectId?: string;
    @IsOptional() @IsIn(['ASSIGNED', 'TRANSFERRED', 'UNASSIGNED']) type?: string;
    /** Statut ACTUEL du prospect */
    @IsOptional() @IsEnum(ProspectStatus) status?: ProspectStatus;
    @IsOptional() @IsString() startDate?: string;
    @IsOptional() @IsString() endDate?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class ProspectActivitiesQueryDto {
    @IsOptional() @IsString() userId?: string;
    @IsOptional() @IsString() prospectId?: string;
    @IsOptional() @IsEnum(ProspectHistoryAction) action?: ProspectHistoryAction;
    @IsOptional() @IsString() startDate?: string;
    @IsOptional() @IsString() endDate?: string;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}
