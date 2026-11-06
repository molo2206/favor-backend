import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource, EntitySubscriberInterface, InsertEvent, RemoveEvent, UpdateEvent } from 'typeorm';
import { AuditChange, currentAudit } from './context/audit-context';
import { sanitize } from './audit-sanitize';

/** Tables trop fréquentes / techniques : jamais suivies */
const IGNORED_TABLES = new Set([
  'audit_logs',
  'driver_locations',
  'driver_location',
  'driver_location_history',
  'notifications',
  'notification',
  'device_tokens',
  'user_devices',
  'ride_events',
  'ride_chat_messages',
  'logs',
  'backup_runs',
  'ip_reputations',
  'query-result-cache',
]);

const IGNORED_FIELDS = new Set(['updatedAt', 'updated_at', 'createdAt', 'created_at', 'version', 'lastSeenAt', 'lastLoginAt', 'lastActiveAt']);

const MAX_CHANGES = 50;

/**
 * ✅ Avant / après réels : chaque insertion, modification ou suppression faite par TypeORM pendant une requête
 * est ajoutée au contexte d'audit (champ « changes » du journal). Aucun effet hors requête HTTP.
 */
@Injectable()
export class AuditSubscriber implements EntitySubscriberInterface<any>, OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  onModuleInit() {
    if (!this.dataSource.subscribers.includes(this)) this.dataSource.subscribers.push(this);
  }

  private push(change: AuditChange) {
    const store = currentAudit();
    if (!store || store.skip) return;
    if (store.changes.length >= MAX_CHANGES) return;
    store.changes.push(change);
  }

  private table(event: { metadata?: any }): string | null {
    const t = event?.metadata?.tableName as string | undefined;
    if (!t || IGNORED_TABLES.has(t)) return null;
    return t;
  }

  private idOf(entity: any, metadata: any): string | null {
    if (!entity) return null;
    try {
      const ids = metadata?.getEntityIdMap?.(entity);
      if (ids && Object.keys(ids).length) {
        const vals = Object.values(ids);
        return vals.length === 1 ? String(vals[0]) : JSON.stringify(ids);
      }
    } catch {
      /* ignore */
    }
    return entity?.id !== undefined ? String(entity.id) : null;
  }

  private columns(metadata: any): string[] {
    return (metadata?.columns ?? []).map((c: any) => c.propertyName).filter((p: string) => !IGNORED_FIELDS.has(p));
  }

  private norm(v: any): any {
    if (v instanceof Date) return v.toISOString();
    if (v && typeof v === 'object' && !Array.isArray(v) && v.id !== undefined && Object.keys(v).length > 3) return { id: v.id };
    return v;
  }

  afterInsert(event: InsertEvent<any>) {
    const table = this.table(event);
    if (!table) return;
    this.push({ table, id: this.idOf(event.entity, event.metadata), op: 'INSERT' });
  }

  beforeUpdate(event: UpdateEvent<any>) {
    const table = this.table(event);
    if (!table || !event.entity) return;
    const before: any = event.databaseEntity ?? null;
    const after: any = event.entity;
    const diff: Record<string, [any, any]> = {};
    for (const col of this.columns(event.metadata)) {
      if (!(col in after)) continue;
      const a = this.norm(after[col]);
      const b = before ? this.norm(before[col]) : undefined;
      if (before && JSON.stringify(a) === JSON.stringify(b)) continue;
      diff[col] = [b === undefined ? null : b, a === undefined ? null : a];
    }
    if (!Object.keys(diff).length) return;
    this.push({ table, id: this.idOf(before ?? after, event.metadata), op: 'UPDATE', changes: sanitize(diff) });
  }

  beforeRemove(event: RemoveEvent<any>) {
    const table = this.table(event);
    if (!table) return;
    const ent: any = event.databaseEntity ?? event.entity;
    const id = event.entityId !== undefined && event.entityId !== null ? String(event.entityId) : this.idOf(ent, event.metadata);
    this.push({ table, id, op: 'DELETE' });
  }
}
