import {
  IsUUID,
  IsInt,
  Min,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsString,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * ✅ Attribut choisi par le client pour une ligne de commande.
 * - attributs à liste (Couleur, Taille…) → attributeValueId (ou value)
 * - attributs libres (TEXT / NUMBER / BOOLEAN) → value
 */
export class OrderItemAttributeInputDto {
  @IsUUID()
  attributeId: string;

  @IsOptional()
  @IsUUID()
  attributeValueId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  value?: string;
}

export class CreateOrderItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @IsNotEmpty()
  price: number;

  // ✅ NOUVEAU : variation choisie (Rouge / XL…). Ses attributs sont repris automatiquement.
  @IsOptional()
  @IsUUID()
  variationId?: string;

  // ✅ NOUVEAU : attributs choisis (si le produit n'a pas de variation, ou en complément)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemAttributeInputDto)
  attributes?: OrderItemAttributeInputDto[];
}
