// src/wishlist/dto/create-wishlist.dto.ts
import { Optional } from '@nestjs/common';
import { IsString } from 'class-validator';

export class CreateWishlistDto {
  @IsString()
  productId: string;

  @Optional()
  @IsString()
  shopType?: string;
}
