import { SetMetadata } from '@nestjs/common';

export const PERMISSION_METADATA = 'permission_required';

/**
 * Exemple : @RequirePermission('product', 'create')
 */
export const RequirePermission = (resource: string, action: 'create' | 'read' | 'update' | 'delete' | 'validate') =>
  SetMetadata(PERMISSION_METADATA, { resource, action });
