import { IsUUID, IsBoolean, IsOptional } from 'class-validator';

export class CreateGlobalAttributesSpecificationDto {
  @IsUUID()
  @IsOptional()
  globalAttributeId: string;

  @IsUUID()
  specificationId: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
