import { PartialType } from '@nestjs/mapped-types';
import { CreatePayrollItemDto } from './create-payroll-item.dto';

export class UpdatePayrollItemDto extends PartialType(CreatePayrollItemDto) {}