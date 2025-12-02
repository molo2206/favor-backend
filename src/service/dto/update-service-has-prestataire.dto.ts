import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceHasPrestataireDto } from './create-service-has-prestataire.dto';

export class UpdateServiceHasPrestataireDto extends PartialType(CreateServiceHasPrestataireDto) {}
