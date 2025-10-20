import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateAttributeValueDto {
  @IsUUID()
  @IsNotEmpty()
  attributeId: string;

  @IsString()
  @IsNotEmpty()
  value: string;
}
