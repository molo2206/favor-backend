import { PartialType } from '@nestjs/mapped-types';
import { CreateRideDto } from './create-ride.dto';
import { RideStatus } from '../enum/RideStatus.enum';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRideDto extends PartialType(CreateRideDto) {
  status?: RideStatus;
  cancelledBy?: 'RIDER' | 'DRIVER' | 'SYSTEM';

  @IsOptional()
  @IsString()
  @MaxLength(500) // Limite de caractères pour la raison
  cancellationReason?: string;
}
