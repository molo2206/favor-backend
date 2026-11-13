import { IsString, IsEnum, IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { Address } from 'src/address-user/enum/address.status.enum';

export class UpdateAddressUserDto {
    @IsString()
    @IsOptional()
    firstName?: string;

    @IsString()
    @IsOptional()
    lastName?: string;

    @IsString()
    @IsOptional()
    phone?: string;

    @IsOptional()
    latitude: string;

    @IsOptional()
    longitude: string;

    @IsString()
    @IsOptional()
    address: string;

    @IsEnum(Address)
    @IsOptional()
    type?: Address;

    @IsBoolean()
    @IsOptional()
    isDefault?: boolean;

    @IsOptional()
    @IsUUID()
    countryId?: string;

    @IsOptional()
    @IsUUID()
    cityId?: string;
}
