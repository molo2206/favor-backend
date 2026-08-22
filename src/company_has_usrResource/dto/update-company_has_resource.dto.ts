import { PartialType } from '@nestjs/swagger';
import { CreateCompanyHasResourceDto } from './create-company_has_resource.dto';

export class UpdateCompanyHasResourceDto extends PartialType(CreateCompanyHasResourceDto) {}
