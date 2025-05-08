import { IsString, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { Address } from 'src/users/utility/common/address.status.enum';


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

    @IsEnum(Address)
    type: Address;

    @IsBoolean()
    @IsOptional()
    isDefault?: boolean;
}
