import { IsUUID, IsObject } from 'class-validator';

export class CreateUserHasPermissionDto {
    @IsUUID()
    userHasCompanyId: string;

    @IsUUID()
    permissionId: string;

    @IsObject()
    actions: {
        create: boolean;
        read: boolean;
        update: boolean;
        delete: boolean;
        status: boolean;
    };
}
