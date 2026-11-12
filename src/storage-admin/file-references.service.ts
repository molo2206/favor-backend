// src/storage-admin/file-references.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as path from 'path';

/**
 * ✅ Colonnes de la base qui contiennent des liens de fichiers (URL, chemin, JSON ou texte avec des liens).
 * Sert à savoir si un fichier du serveur est encore utilisé avant de le supprimer / déplacer,
 * et à trouver les fichiers orphelins (présents sur le disque, utilisés nulle part).
 */
export const FILE_REFERENCE_COLUMNS: [string, string][] = [
  ['addresses', 'photos'], ['app_settings', 'logo'], ['attribute_values', 'imageUrl'],
  ['bo_asset_assignments', 'photoUrl'], ['bo_asset_categories', 'photoUrl'], ['bo_asset_movements', 'photoUrl'], ['bo_assets', 'photoUrl'],
  ['bo_cash_transactions', 'attachmentUrl'], ['bo_chat_attachments', 'thumbnailUrl'], ['bo_chat_attachments', 'url'],
  ['bo_chat_conversations', 'avatar'], ['bo_chat_messages', 'metadata'],
  ['bo_fleet_documents', 'fileUrl'], ['bo_fleet_fuel_logs', 'receiptUrl'], ['bo_fleet_maintenances', 'photoUrl'], ['bo_fleet_missions', 'photoUrl'], ['bo_fleet_vehicles', 'photoUrl'],
  ['bo_material_requests', 'photoUrl'], ['bo_media_files', 'thumbnailUrl'], ['bo_media_files', 'url'], ['bo_media_publications', 'coverUrl'], ['bo_media_services', 'imageUrl'],
  ['bo_media_vendor_assignments', 'deliveryUrl'], ['bo_media_vendor_documents', 'url'], ['bo_media_vendor_payments', 'receiptUrl'], ['bo_media_vendors', 'photoUrl'],
  ['bo_need_attachments', 'url'], ['bo_need_signatures', 'signatureUrl'],
  ['brands', 'image'], ['category', 'image'], ['colis', 'photos'],
  ['company', 'banner'], ['company', 'logo'], ['company', 'registrationDocumentUrl'], ['complaints', 'attachments'], ['contracts', 'documentUrl'],
  ['country_providers', 'image'], ['delivery', 'signatureImageUrl'], ['driver_associations', 'logoUrl'],
  ['driver_vehicles', 'assuranceUrl'], ['driver_vehicles', 'permiUrl'], ['driver_vehicles', 'photos'], ['driver_vehicles', 'registrationUrl'],
  ['hr_employees', 'image'], ['hr_employee_signatures', 'imageUrl'], ['hr_employee_signatures', 'storagePath'], ['hr_employee_documents', 'storagePath'],
  ['image_product_entity', 'url'], ['invoice_configuration', 'logo'], ['meals', 'image_url'], ['network_providers', 'image'],
  ['order_item_attributes', 'imageUrl'], ['order_items', 'attributesSnapshot'], ['prestataires', 'image'], ['products', 'image'],
  ['ride_chat_messages', 'audioUrl'], ['ride_chat_reports', 'messageSnapshot'], ['room_image', 'url'], ['shipments', 'image'],
  ['specification', 'image'], ['sub_order_items', 'attributesSnapshot'], ['type_companies', 'image'], ['type_transport', 'image'],
  ['users', 'image'], ['users', 'licenseDocumentUrl'], ['vehicle_registrations', 'availableDocuments'], ['vehicle_registrations', 'images'], ['vehicles', 'images'],
];

const FILE_TOKEN = /[^\s"'\\/<>()\[\]{},;=?&#]+\.[A-Za-z0-9]{2,5}(?=$|[\s"'\\<>()\[\]{},;?&#])/g;

/** « photo_thumb.webp » et « photo.jpg » → « photo » (miniatures liées à l'original) */
export function fileStem(name: string): string {
  let n = name;
  try {
    n = decodeURIComponent(n);
  } catch {
    /* tel quel */
  }
  n = path.basename(n).toLowerCase();
  n = n.replace(/\.[a-z0-9]{1,5}$/, '');
  return n.replace(/_thumb$/, '');
}

@Injectable()
export class FileReferencesService {
  private readonly logger = new Logger(FileReferencesService.name);
  private cache: { at: number; stems: Set<string>; columns: number; missing: string[] } | null = null;
  private building: Promise<{ stems: Set<string>; columns: number; missing: string[] }> | null = null;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Tous les noms de fichiers utilisés dans la base (index en mémoire, 5 min) */
  async index(force = false): Promise<{ stems: Set<string>; columns: number; missing: string[] }> {
    if (!force && this.cache && Date.now() - this.cache.at < 5 * 60 * 1000) return this.cache;
    if (this.building) return this.building;
    this.building = this.build().finally(() => (this.building = null));
    return this.building;
  }

  private async build() {
    const started = Date.now();
    const stems = new Set<string>();
    const missing: string[] = [];
    let columns = 0;
    for (const [table, col] of FILE_REFERENCE_COLUMNS) {
      let offset = 0;
      const batch = 20000;
      try {
        for (;;) {
          const rows: any[] = await this.dataSource.query(
            `SELECT \`${col}\` AS v FROM \`${table}\` WHERE \`${col}\` IS NOT NULL LIMIT ${batch} OFFSET ${offset}`,
          );
          for (const r of rows) this.collect(r.v, stems);
          if (rows.length < batch) break;
          offset += batch;
        }
        columns++;
      } catch {
        missing.push(`${table}.${col}`);
      }
    }
    this.cache = { at: Date.now(), stems, columns, missing };
    this.logger.log(`Index des fichiers utilisés : ${stems.size} noms (${columns} colonnes) en ${Date.now() - started} ms`);
    return this.cache;
  }

  private collect(v: any, stems: Set<string>) {
    if (v === null || v === undefined) return;
    const s = typeof v === 'string' ? v : Buffer.isBuffer(v) ? v.toString('utf8') : JSON.stringify(v);
    if (!s) return;
    const matches = s.match(FILE_TOKEN);
    if (matches) for (const m of matches) stems.add(fileStem(m));
  }

  invalidate() {
    this.cache = null;
  }

  /** Le fichier (ou sa miniature) est-il utilisé quelque part ? */
  async isUsed(relOrName: string): Promise<boolean> {
    const { stems } = await this.index();
    return stems.has(fileStem(relOrName));
  }

  /** Où le fichier est utilisé (table.colonne + nombre de lignes) — recherche directe en base */
  async whereUsed(relOrName: string): Promise<{ table: string; column: string; count: number }[]> {
    const base = path.basename(relOrName);
    const stem = base.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/_thumb$/, '');
    if (!stem || stem.length < 3) return [];
    const like = `%${stem.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const out: { table: string; column: string; count: number }[] = [];
    for (const [table, col] of FILE_REFERENCE_COLUMNS) {
      try {
        const r: any[] = await this.dataSource.query(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE \`${col}\` LIKE ?`, [like]);
        const n = Number(r?.[0]?.n ?? 0);
        if (n) out.push({ table, column: col, count: n });
      } catch {
        /* table absente */
      }
    }
    return out;
  }
}
