import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class UpdateStatusDto {
  @IsString()
  @IsNotEmpty()
  @Length(4, 6)        // ✅ adaptez selon la longueur réelle du PIN
  pin: string;

  @IsOptional()
  @IsString()
  note?: string;
}