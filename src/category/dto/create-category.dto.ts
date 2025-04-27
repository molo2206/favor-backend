import { IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  parentId?: string;

  @IsOptional()
  @IsString()
  type?: string;
}
