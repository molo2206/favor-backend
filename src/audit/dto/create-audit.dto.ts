// create-audit.dto.ts
export class CreateAuditDto {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
}