// create-audit.dto.ts
export class CreateAuditDto {
  userId?: string | null;
  userName?: string | null;
  userRole?: string | null;
  companyId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  category?: string;
  severity?: string;
  status?: string;
  oldValue?: any;
  newValue?: any;
  changes?: any;
  metadata?: any;
  httpStatus?: number | null;
  errorMessage?: string | null;
  durationMs?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  platform?: string | null;
  method?: string | null;
  route?: string | null;
  url?: string | null;
  requestId?: string | null;
}
