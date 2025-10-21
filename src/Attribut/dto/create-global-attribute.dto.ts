import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
} from 'class-validator';

export class CreateGlobalAttributeDto {
  @IsString()
  key: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString() // on reçoit une chaîne type "option1, option2, option3"
  options?: string;
}
