import { IsNotEmpty, IsOptional, IsString, IsBoolean } from 'class-validator';

export class CreateBrandDto {
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
