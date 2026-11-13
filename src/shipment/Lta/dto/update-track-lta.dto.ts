import { IsBoolean } from 'class-validator';

export class UpdateTrackingCompletedDto {
  @IsBoolean()
  completed: boolean;
}
