// src/audit/audit.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { ActionType } from '../enum/action-type.enum';

export const AUDIT_KEY = 'audit_action';

export const AuditAction = (
  action: ActionType,
  entity: string,
) =>
  SetMetadata(AUDIT_KEY, { action, entity });
