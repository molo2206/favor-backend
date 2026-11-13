import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class ConvertProspectDto {
    @IsOptional() @IsBoolean() createUserAccount?: boolean = true;
    @IsOptional() @IsString() password?: string;
    /** ✅ Compte existant à utiliser (sinon : compte rattaché au prospect ou trouvé par téléphone / e-mail) */
    @IsOptional() @IsUUID() existingUserId?: string;
}
