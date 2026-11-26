import {
    IsUUID,
    IsNotEmpty,
    IsString,
    IsOptional,
    IsBoolean,
    IsDateString,
    IsArray,
    ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CompanyPermissionItemDto } from 'src/company/dto/setUserCompanyPermissions.dto';

export class CreateUserHasCompanyDto {
    @IsUUID()
    @IsNotEmpty()
    userId: string;

    @IsUUID()
    @IsNotEmpty()
    companyId: string;

    @IsString()
    @IsOptional()
    role?: string; 

    @IsUUID()
    @IsNotEmpty()
    roleId: string;

    @IsBoolean()
    @IsOptional()
    isOwner?: boolean; // Définit si cet utilisateur est le créateur ou proprio

    @IsDateString()
    @IsOptional()
    joinedAt?: string; // Date d’adhésion à l’entreprise

    @IsString()
    @IsOptional()
    status?: string; // Ex: "active", "pending", "suspended"

    // ✅ Branche de l'affectation (sinon : branche active / première branche de l'entreprise)
    @Transform(({ value }) => (value === '' || value === null ? undefined : value))
    @IsUUID()
    @IsOptional()
    branchId?: string;

    // ✅ Permissions à donner (sinon : permissions par défaut de l'entreprise)
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CompanyPermissionItemDto)
    permissions?: CompanyPermissionItemDto[];
}
