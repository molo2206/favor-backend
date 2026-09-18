import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyStatus } from 'src/company/enum/company-status.enum';

interface UserWithCompanyStatus extends UserEntity {
  companyStatus?: CompanyStatus;
}

export { UserWithCompanyStatus };