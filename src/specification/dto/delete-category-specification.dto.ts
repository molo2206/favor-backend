// delete-category-specification.dto.ts
import { IsString } from 'class-validator';

export class DeleteCategorySpecificationDto {
  @IsString()
  categoryId: string;

  @IsString()
  specificationId: string;
}
