import { IsOptional, IsString, Length } from 'class-validator';

export class ConfirmPinDto {

  @IsString()
  @Length(6, 6)
  pin: string;

  @IsOptional()
  @IsString()
  otpCode?: string;
}