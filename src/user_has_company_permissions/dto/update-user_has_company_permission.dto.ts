import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class UpdateUserHasCompanyPermissionDto {
    @IsUUID()
    userHasCompanyId: string;

    @IsUUID()
    permissionId: string;

    // Les actions seront optionnelles pour une mise à jour
    @IsOptional()
    @IsBoolean()
    create?: boolean;

    @IsOptional()
    @IsBoolean()
    update?: boolean;

    @IsOptional()
    @IsBoolean()
    delete?: boolean;

    @IsOptional()
    @IsBoolean()
    read?: boolean;

    @IsOptional()
    @IsBoolean()
    status?: boolean;
}
