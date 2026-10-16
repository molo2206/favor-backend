// order-response.dto.ts
import { Expose, Type } from 'class-transformer';
import { OrderStatus } from 'src/order/enum/order.status.enum';
import { PaymentStatus } from 'src/transaction/enum/payment.status.enum';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { CompanyActivity } from 'src/company/enum/activity.company.enum';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';

class OrderItemDto {
  @Expose()
  id: string;

  @Expose()
  quantity: number;

  @Expose()
  price: number;

  @Expose()
  @Type(() => ProductDto)
  product: ProductDto;
}

class ProductDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  description?: string;

  @Expose()
  price: number;

  @Expose()
  image?: string;
}

class SubOrderItemDto {
  @Expose()
  id: string;

  @Expose()
  quantity: number;

  @Expose()
  price: number;

  @Expose()
  @Type(() => ProductDto)
  product: ProductDto;
}

class SubOrderDto {
  @Expose()
  id: string;

  @Expose()
  totalAmount: number;

  @Expose()
  status: OrderStatus;

  @Expose()
  invoiceNumber?: string;

  @Expose()
  @Type(() => SubOrderItemDto)
  items: SubOrderItemDto[];

  @Expose()
  @Type(() => CompanyDto)
  company: CompanyDto;
}

class CompanyDto {
  @Expose()
  id: string;

  @Expose()
  companyName?: string;

  @Expose()
  logo?: string;

  @Expose()
  email?: string;

  @Expose()
  phone?: string;
}

class AddressUserDto {
  @Expose()
  id: string;

  @Expose()
  address: string;

  @Expose()
  city?: string;

  @Expose()
  country?: string;

  @Expose()
  postalCode?: string;
}

class UserDto {
  @Expose()
  id: string;

  @Expose()
  fullName: string;

  @Expose()
  email: string;

  @Expose()
  phone?: string;
}

export class OrderResponseDto {
  @Expose()
  id: string;

  @Expose()
  totalAmount: number;

  @Expose()
  shippingCost?: number;

  @Expose()
  grandTotal: number;

  @Expose()
  currency: string;

  @Expose()
  type: CompanyType;

  @Expose()
  status: OrderStatus;

  @Expose()
  paymentStatus: PaymentStatus;

  @Expose()
  paid: boolean;

  @Expose()
  shopType: CompanyActivity;

  @Expose()
  paymentMethod?: PaymentMethod;

  @Expose()
  invoiceNumber?: string;

  @Expose()
  pin?: string;

  @Expose()
  appliedFeeRate?: number;

  @Expose()
  transactionFee?: number;

  @Expose()
  whatsapp_number?: string;

  @Expose()
  @Type(() => UserDto)
  user: UserDto;

  @Expose()
  @Type(() => AddressUserDto)
  addressUser: AddressUserDto;

  @Expose()
  @Type(() => OrderItemDto)
  orderItems: OrderItemDto[];

  @Expose()
  @Type(() => SubOrderDto)
  subOrders: SubOrderDto[];

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}