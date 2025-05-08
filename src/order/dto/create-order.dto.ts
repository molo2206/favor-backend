import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from 'src/order-item/dto/create-order-item.dto';
import { CompanyType } from 'src/users/utility/common/type.company.enum';

export class CreateOrderDto {
    @IsNumber()
    @IsNotEmpty()
    totalAmount: number;

    @IsNumber()
    @IsNotEmpty()
    shippingCost: number;

    @IsNotEmpty()
    addressUserId: string;

    @IsOptional()
    @IsEnum(CompanyType, {
        message: `Le type d'entreprise doit être l'une des valeurs suivantes : ${Object.values(CompanyType).join(', ')}`,
    })
    type?: CompanyType;

    @IsString()
    @IsNotEmpty()
    currency: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateOrderItemDto)
    orderItems: CreateOrderItemDto[];
}
