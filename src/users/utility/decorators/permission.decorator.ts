import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';
export const CheckPermission = (permission: string, action: 'read' | 'create' | 'update' | 'delete') =>
  SetMetadata(PERMISSION_KEY, { permission, action });
