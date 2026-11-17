// src/audit/decorator/audit.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { ActionType } from '../enum/action-type.enum';
import { AuditCategory, AuditSeverity } from '../enum/audit.enums';

export const AUDIT_KEY = 'audit_action';
export const AUDIT_SKIP_KEY = 'audit_skip';

export type AuditOptions = {
  category?: AuditCategory;
  severity?: AuditSeverity;
  /** Ne pas enregistrer la réponse (ex. listes volumineuses) */
  skipResponse?: boolean;
};

/**
 * ✅ Inchangé pour l'existant : @AuditAction(ActionType.UPDATE, 'Order')
 * Nouveau (facultatif) : @AuditAction(ActionType.UPDATE, 'Order', { category: AuditCategory.FINANCE, severity: AuditSeverity.WARNING })
 */
export const AuditAction = (action: ActionType | string, entity: string, options: AuditOptions = {}) =>
  SetMetadata(AUDIT_KEY, { action, entity, ...options });

/** ✅ Exclure une route de l'audit automatique (ex. positions GPS très fréquentes) */
export const SkipAudit = () => SetMetadata(AUDIT_SKIP_KEY, true);
