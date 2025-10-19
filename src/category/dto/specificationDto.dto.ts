import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class SpecificationDto {
  @IsString()
  specificationId: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean) 
  required?: boolean;
}
