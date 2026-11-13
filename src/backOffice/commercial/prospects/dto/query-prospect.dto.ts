import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ProspectStatus } from '../../common/enums/prospect-status.enum';
import { ProspectSocialNetwork } from '../../common/enums/prospect-tracking.enum';

export class QueryProspectDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number = 20;
    @IsOptional() @IsEnum(ProspectStatus) status?: ProspectStatus;
    @IsOptional() @IsString() assignedToId?: string;
    @IsOptional() @IsString() companyId?: string;
    @IsOptional() @IsString() search?: string;
    // ✅ Nouveaux filtres
    @IsOptional() @IsString() createdById?: string;
    @IsOptional() @IsString() countryId?: string;
    @IsOptional() @IsString() cityId?: string;
    @IsOptional() @IsString() source?: string;
    @IsOptional() @IsEnum(ProspectSocialNetwork) socialNetwork?: ProspectSocialNetwork;
    @IsOptional() @IsString() language?: string;
    /** true = seulement les prospects qui ont déjà un compte sur la plateforme */
    @IsOptional() @IsIn(['true', 'false']) hasAccount?: string;
    @IsOptional() @IsString() startDate?: string;
    @IsOptional() @IsString() endDate?: string;
}
