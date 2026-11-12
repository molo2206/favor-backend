import { IsEnum, IsNotEmpty } from 'class-validator';

export enum TrackingAction {
  START = 'start',
  STOP = 'stop',
}

export class StartTrackingDto {
  @IsEnum(TrackingAction, {
    message: "L'action doit être 'start' ou 'stop'.",
  })
  @IsNotEmpty()
  action: TrackingAction;
}