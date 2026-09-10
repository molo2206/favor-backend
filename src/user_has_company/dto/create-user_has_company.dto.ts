import {
    IsUUID,
    IsNotEmpty,
    IsString,
    IsOptional,
    IsBoolean,
    IsDateString,
} from 'class-validator';

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
}
