import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';

export function isPlatformAdmin(user?: UserEntity | null): boolean {
  return user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
}

/**
 * Entreprise concernée : celle envoyée, sinon l'entreprise active de l'utilisateur.
 * Vérifie que l'utilisateur y est rattaché (sauf admin / super admin).
 */
export async function resolveCompanyId(
  dataSource: DataSource,
  user: UserEntity,
  companyId: string | undefined | null,
  messages: { required: string; forbidden: string },
): Promise<string> {
  const id = companyId || user?.activeCompanyId;
  if (!id) throw new BadRequestException(messages.required);
  if (isPlatformAdmin(user)) return id;
  const rows = await dataSource.query(
    'SELECT 1 FROM `user_has_company` WHERE `userId` = ? AND `companyId` = ? LIMIT 1',
    [user.id, id],
  );
  if (!Array.isArray(rows) || !rows.length) throw new ForbiddenException(messages.forbidden);
  return id;
}

export function pageParams(page?: number | string, limit?: number | string) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(200, Math.max(1, Number(limit) || 20));
  return { page: p, limit: l, skip: (p - 1) * l };
}

export function reference(prefix: string): string {
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${prefix}-${day}-${Math.floor(10000 + Math.random() * 90000)}`;
}

export const SUPPORTED_LANGS = ['fr', 'en', 'es', 'sw', 'ar'];

export function langFrom(req: { headers: Record<string, any> }): string {
  const raw = String(req.headers['accept-language'] || 'fr').split(',')[0].split(';')[0].trim().slice(0, 2);
  return SUPPORTED_LANGS.includes(raw) ? raw : 'fr';
}
