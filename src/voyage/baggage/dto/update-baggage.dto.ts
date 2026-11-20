// dto/update-baggage.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateBaggageDto } from './create-baggage.dto';

export class UpdateBaggageDto extends PartialType(CreateBaggageDto) {}