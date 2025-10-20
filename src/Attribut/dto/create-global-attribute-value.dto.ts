// create-global-attribute-value.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateGlobalAttributeValueDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  value: string;
}
