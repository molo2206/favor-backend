import { IsEnum } from 'class-validator';

export enum TrackingAction {
    START = 'start',
    STOP = 'stop',
}

export class StartTrackingDto {
    @IsEnum(TrackingAction, {
        message: "L'action doit être 'start' ou 'stop'.",
    })
    action: TrackingAction;
}