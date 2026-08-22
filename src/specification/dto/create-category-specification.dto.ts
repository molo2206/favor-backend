// create-category-specification.dto.ts
import { IsString, IsBoolean, IsOptional, IsInt, Min } from 'class-validator';

export class CreateCategorySpecificationDto {
  @IsString()
  categoryId: string;

  @IsString()
  specificationId: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean = false;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;
}
