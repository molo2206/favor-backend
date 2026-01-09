import { PartialType } from '@nestjs/mapped-types';
import { CreateTypeTransportDto } from './create-type-transport.dto';

export class UpdateTypeTransportDto extends PartialType(CreateTypeTransportDto) {}