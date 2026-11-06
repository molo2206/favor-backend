/**
 * ✅ Actions de l'audit. Les 6 premières sont celles d'origine (utilisées par @AuditAction).
 * Les autres sont posées automatiquement (connexion, mot de passe, rôles…) ou par AuditService.record().
 */
export enum ActionType {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  VIEW = 'VIEW',
  // ---- sécurité / comptes ----
  LOGIN_FAILED = 'LOGIN_FAILED',
  SIGNUP = 'SIGNUP',
  TOKEN_REFRESH_FAILED = 'TOKEN_REFRESH_FAILED',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET = 'PASSWORD_RESET',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  OTP_VERIFY = 'OTP_VERIFY',
  TWO_FACTOR = 'TWO_FACTOR',
  ROLE_CHANGE = 'ROLE_CHANGE',
  PERMISSION_CHANGE = 'PERMISSION_CHANGE',
  ACCOUNT_STATUS_CHANGE = 'ACCOUNT_STATUS_CHANGE',
  ACCOUNT_UNBLOCK = 'ACCOUNT_UNBLOCK',
  ACCOUNT_DELETE = 'ACCOUNT_DELETE',
  ACCESS_DENIED = 'ACCESS_DENIED',
  // ---- finance ----
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
  WITHDRAWAL = 'WITHDRAWAL',
  // ---- technique / administration ----
  EXPORT = 'EXPORT',
  BACKUP = 'BACKUP',
  RESTORE = 'RESTORE',
  CONFIG_CHANGE = 'CONFIG_CHANGE',
  SYSTEM = 'SYSTEM',
}
