import { PartialType } from '@nestjs/swagger';
import { CreateTypeCompanyDto } from './create-type_company.dto';

export class UpdateTypeCompanyDto extends PartialType(CreateTypeCompanyDto) {}
