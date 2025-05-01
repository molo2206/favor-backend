import { IsEnum } from "class-validator";
import { CompanyStatus } from "src/users/utility/common/company-status.enum";

// dto/update-company-status.dto.ts
export class UpdateCompanyStatusDto {
    @IsEnum(CompanyStatus, { message: 'Statut invalide.' })
    status: CompanyStatus;
}
