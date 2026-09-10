
import { IsEnum } from 'class-validator';
import { DriverStatus } from './driver-status.enum';

export class ChangeDriverStatusDto {
  @IsEnum(DriverStatus)
  status: DriverStatus;
}
