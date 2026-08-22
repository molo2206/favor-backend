import { IsOptional, IsString, IsBoolean, IsUUID } from 'class-validator';

export class UpdateResourceDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;

  @IsOptional()
  @IsUUID()
  platformId?: string;
}
