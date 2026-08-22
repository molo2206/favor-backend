import { IsString, IsEnum, IsBoolean, IsOptional } from 'class-validator';
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
}
