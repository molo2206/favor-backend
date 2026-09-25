import { PartialType } from '@nestjs/mapped-types';
import { CreateUserHasCompanyDto } from './create-user_has_company.dto';

export class UpdateUserHasCompanyDto extends PartialType(CreateUserHasCompanyDto) {
    
}
