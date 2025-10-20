// create-global-attribute-value.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateGlobalAttributeValueDto {
  @IsString()
  @IsNotEmpty()
  value: string;
}
