import { ActionType } from './enum/action-type.enum';
import { AuditCategory, AuditSeverity } from './enum/audit.enums';

/**
 * ✅ Classement automatique des opérations (sans toucher aux contrôleurs) :
 * catégorie, action précise et gravité d'après la route.
 */
type Rule = { test: RegExp; methods?: string[]; action?: string; category: AuditCategory; severity?: AuditSeverity; security?: boolean };

const RULES: Rule[] = [
  // ---- Connexion / comptes ----
  { test: /\/users\/signin$/, action: ActionType.LOGIN, category: AuditCategory.SECURITY, security: true },
  { test: /\/users\/google-login$/, action: ActionType.LOGIN, category: AuditCategory.SECURITY, security: true },
  { test: /\/users\/apple-login$/, action: ActionType.LOGIN, category: AuditCategory.SECURITY, security: true },
  { test: /\/users\/signup$/, action: ActionType.SIGNUP, category: AuditCategory.SECURITY, security: true },
  { test: /\/users\/refresh-token$/, action: ActionType.TOKEN_REFRESH_FAILED, category: AuditCategory.SECURITY, security: true },
  { test: /\/users\/forgot-password$/, action: ActionType.PASSWORD_RESET_REQUEST, category: AuditCategory.SECURITY, severity: AuditSeverity.WARNING, security: true },
  { test: /\/users\/reset-password$/, action: ActionType.PASSWORD_RESET, category: AuditCategory.SECURITY, severity: AuditSeverity.WARNING, security: true },
  { test: /\/users\/me\/change-password$/, action: ActionType.PASSWORD_CHANGE, category: AuditCategory.SECURITY, severity: AuditSeverity.WARNING, security: true },
  { test: /\/users\/verify-otp$|\/otp(\/|$)/, action: ActionType.OTP_VERIFY, category: AuditCategory.SECURITY, security: true },
  { test: /\/users\/(generate|verify)$/, action: ActionType.TWO_FACTOR, category: AuditCategory.SECURITY, severity: AuditSeverity.WARNING, security: true },
  { test: /\/users\/[^/]+\/role$/, action: ActionType.ROLE_CHANGE, category: AuditCategory.SECURITY, severity: AuditSeverity.CRITICAL },
  { test: /\/users\/[^/]+\/user\/active$/, action: ActionType.ACCOUNT_STATUS_CHANGE, category: AuditCategory.SECURITY, severity: AuditSeverity.CRITICAL },
  { test: /\/users\/users\/[^/]+\/unblock$/, action: ActionType.ACCOUNT_UNBLOCK, category: AuditCategory.SECURITY, severity: AuditSeverity.WARNING },
  { test: /\/users\/delete\/own-account$/, action: ActionType.ACCOUNT_DELETE, category: AuditCategory.SECURITY, severity: AuditSeverity.CRITICAL },
  { test: /\/users\/admin\/create$|\/users\/[^/]+\/admin-update$/, category: AuditCategory.SECURITY, severity: AuditSeverity.WARNING },
  { test: /\/users\/me(\/(email|phone))?$/, category: AuditCategory.SECURITY },
  { test: /\/(roles?|resources|user-platform-roles|company-has-resource|user-has-company)(\/|$)/, action: ActionType.PERMISSION_CHANGE, category: AuditCategory.SECURITY, severity: AuditSeverity.CRITICAL },
  { test: /\/backoffice\/(finance\/cash-flow\/members|needs\/config\/members)/, action: ActionType.PERMISSION_CHANGE, category: AuditCategory.SECURITY, severity: AuditSeverity.CRITICAL },
  // ---- Administration ----
  { test: /\/backup\/download\//, action: ActionType.EXPORT, category: AuditCategory.ADMIN, severity: AuditSeverity.CRITICAL },
  { test: /\/backup(\/|$).*restore/, action: ActionType.RESTORE, category: AuditCategory.ADMIN, severity: AuditSeverity.CRITICAL },
  { test: /\/backup(\/|$)/, category: AuditCategory.ADMIN, severity: AuditSeverity.WARNING },
  { test: /\/(app-setting|platforms|type-companies|type-transports|exchange-rates|taux-company|pricings|service-zones|company-tariffs)(\/|$)/, action: undefined, category: AuditCategory.ADMIN, severity: AuditSeverity.WARNING },
  { test: /\/backoffice\/needs\/config|\/cash-flow\/approval-rules|\/settings$/, category: AuditCategory.ADMIN, severity: AuditSeverity.WARNING },
  // ---- Finance ----
  { test: /\/fpay\/cashout|\/driver-cashout|\/rides\/driver\/earnings.*(cashout|withdraw)/, action: ActionType.WITHDRAWAL, category: AuditCategory.FINANCE, severity: AuditSeverity.CRITICAL },
  { test: /\/(fpay|pawapay|transaction|company\/transactions|payment-res-travel)(\/|$)/, category: AuditCategory.FINANCE, severity: AuditSeverity.WARNING },
  { test: /\/backoffice\/finance(\/|$)|\/hr\/agent-payments|\/payroll(\/|$)/, category: AuditCategory.FINANCE, severity: AuditSeverity.WARNING },
  { test: /\/backoffice\/needs\/[^/]+\/(authorize|disbursements)$/, action: ActionType.PAYMENT, category: AuditCategory.FINANCE, severity: AuditSeverity.CRITICAL },
  { test: /\/(pay|payment|payment-method|payment\/confirm|payment\/admin-confirm)$/, action: ActionType.PAYMENT, category: AuditCategory.FINANCE, severity: AuditSeverity.WARNING },
  { test: /refund/, action: ActionType.REFUND, category: AuditCategory.FINANCE, severity: AuditSeverity.CRITICAL },
  // ---- Technique ----
  { test: /\/(files|images|room-image|notifications|openai|sms|signature)(\/|$)|\/device-token$/, category: AuditCategory.TECHNICAL },
  { test: /\/export$|\/pdf$/, action: ActionType.EXPORT, category: AuditCategory.BUSINESS },
];

/** Routes trop fréquentes ou sans intérêt (AUDIT_EXCLUDE_PATHS ajoute des motifs, séparés par des virgules) */
const DEFAULT_EXCLUDES = [
  /\/driver-location(\/|$)/,
  /\/ride-chat\/[^/]+\/read$/,
  /\/notifications\/[^/]+\/read$|\/notifications\/read-all$/,
  /\/maps(\/|$)/,
  /\/users\/device-token$/,
  /\/audit-logs(\/|$)/,
];

let extraExcludes: RegExp[] | null = null;
function excludes(): RegExp[] {
  if (extraExcludes === null) {
    extraExcludes = String(process.env.AUDIT_EXCLUDE_PATHS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        try {
          return new RegExp(s);
        } catch {
          return null;
        }
      })
      .filter((r): r is RegExp => !!r);
  }
  return [...DEFAULT_EXCLUDES, ...extraExcludes];
}

export function isExcluded(path: string): boolean {
  return excludes().some((r) => r.test(path));
}

export type Classified = { action: string; category: AuditCategory; severity: AuditSeverity; security: boolean };

export function classify(path: string, method: string): Classified {
  const p = path.split('?')[0].replace(/\/+$/, '');
  const m = method.toUpperCase();
  const base = m === 'POST' ? ActionType.CREATE : m === 'DELETE' ? ActionType.DELETE : m === 'GET' ? ActionType.VIEW : ActionType.UPDATE;
  for (const r of RULES) {
    if (r.methods && !r.methods.includes(m)) continue;
    if (r.test.test(p)) {
      return {
        action: r.action ?? base,
        category: r.category,
        severity: r.severity ?? (m === 'DELETE' ? AuditSeverity.WARNING : AuditSeverity.INFO),
        security: !!r.security,
      };
    }
  }
  return { action: base, category: AuditCategory.BUSINESS, severity: m === 'DELETE' ? AuditSeverity.WARNING : AuditSeverity.INFO, security: false };
}

/** Ressource d'après le chemin : /api/v1/service-client/tickets/123 → service-client/tickets */
export function entityFromPath(path: string): string {
  const parts = path
    .split('?')[0]
    .replace(/^\/?api\/v\d+\//, '')
    .split('/')
    .filter(Boolean)
    .filter((s) => !/^[0-9a-f-]{8,}$/i.test(s) && !/^\d+$/.test(s));
  return (parts.slice(0, 2).join('/') || 'unknown').slice(0, 100);
}
