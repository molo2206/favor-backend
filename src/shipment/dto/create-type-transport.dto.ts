import { IsString, IsOptional } from 'class-validator';

export class CreateTypeTransportDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;
}
