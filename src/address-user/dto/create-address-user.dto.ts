import { IsString, IsEnum, IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { Address } from 'src/address-user/enum/address.status.enum';


export class CreateAddressUserDto {
    @IsString()
    firstName: string;

    @IsString()
    lastName: string;

    @IsString()
    phone: string;

    @IsString()
    latitude: string;

    @IsString()
    longitude: string;

    @IsString()
    address: string;

    @IsEnum(Address)
    type: Address;

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
