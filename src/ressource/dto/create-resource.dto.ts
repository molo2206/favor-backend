import { IsNotEmpty, IsString, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CreateResourceDto {
  @IsNotEmpty()
  @IsString()
  label: string;

  @IsNotEmpty()
  @IsString()
  value: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;
}
