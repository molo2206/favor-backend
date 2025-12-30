import { PartialType } from '@nestjs/swagger';
import { CreateTauxCompanyDto } from './create-taux-company.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateTauxCompanyDto extends PartialType(CreateTauxCompanyDto) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
