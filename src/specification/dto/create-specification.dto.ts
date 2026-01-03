import { IsString, IsEnum, IsOptional } from 'class-validator';
import { SpecFieldType } from '../enum/SpecFieldType';

export class CreateSpecificationDto {
  @IsString()
  key: string;

  @IsString()
  label: string;

  @IsEnum(SpecFieldType)
  type: SpecFieldType;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString() // on reçoit une chaîne type "option1, option2, option3"
  options?: string;

  @IsOptional()
  @IsString()
  image?: string;
}
