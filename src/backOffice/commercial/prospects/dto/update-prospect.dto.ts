import { PartialType } from '@nestjs/mapped-types';
import { CreateProspectDto } from './create-prospect.dto';

export class UpdateProspectDto extends PartialType(CreateProspectDto) { }