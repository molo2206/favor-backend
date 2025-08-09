import { PartialType } from '@nestjs/swagger';
import { CreateReservServiceDto } from './create-reserv-service.dto';

export class UpdateReservServiceDto extends PartialType(CreateReservServiceDto) {}
