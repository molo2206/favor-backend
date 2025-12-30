import { IsOptional, IsUUID, IsEnum } from 'class-validator';
import { CompanyStatus } from 'src/company/enum/company-status.enum';

export class UpdateCompanyDto {
    @IsUUID()
    id: string;

    @IsOptional()
    @IsEnum(CompanyStatus, {
      message: 'Status must be pending, validated, or rejected',
    })
    status?: CompanyStatus;
}
