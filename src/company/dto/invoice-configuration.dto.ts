import { IsOptional, IsString, IsObject, MaxLength } from 'class-validator';

export class CreateInvoiceConfigurationDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  header?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  footer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  logo?: string;

  @IsOptional()
  @IsObject()
  theme?: {
    primaryColor?: string;
    secondaryColor?: string;
    textColor?: string;
    fontFamily?: string;
  };
}

export class UpdateInvoiceConfigurationDto extends CreateInvoiceConfigurationDto {}