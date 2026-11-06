// src/operation/dto/update-operation-status.dto.ts
import { IsEnum } from 'class-validator';
import { OperationStatus } from '../enum/operation.status.enum';

export class UpdateOperationStatusDto {
  @IsEnum(OperationStatus)
  status: OperationStatus;
}
