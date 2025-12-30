import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from 'src/order-item/dto/create-order-item.dto';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { CompanyActivity } from 'src/company/enum/activity.company.enum';

export class CreateOrderDto {
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  totalAmount: number;

  @IsNotEmpty()
  addressUserId: string;

  @IsOptional()
  @IsEnum(CompanyType, {
    message: `Le type d'entreprise doit être l'une des valeurs suivantes : ${Object.values(CompanyType).join(', ')}`,
  })
  type?: CompanyType;

  @IsOptional()
  @IsEnum(CompanyActivity, {
    message: `Company activité doit être l'une des valeurs suivantes : ${Object.values(CompanyActivity).join(', ')}`,
  })
  shopType?: CompanyActivity;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  orderItems: CreateOrderItemDto[];
}
