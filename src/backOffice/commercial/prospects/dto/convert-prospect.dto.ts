import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ConvertProspectDto {
    @IsOptional() @IsBoolean() createUserAccount?: boolean = true;
    @IsOptional() @IsString() password?: string;
}