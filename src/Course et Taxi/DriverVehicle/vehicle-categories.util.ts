import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/**
 * ✅ Un véhicule (et son chauffeur) peut servir dans PLUSIEURS catégories de course
 *    (ex. Confort + Familiale).
 *
 *  - `driver_vehicles.categoryId` reste la catégorie PRINCIPALE (inchangée, affichage, anciennes routes).
 *  - Table `driver_vehicle_categories` (vehicleId, categoryId) : TOUTES les catégories du véhicule,
 *    principale comprise. Script : db/sql/vehicules_multi_categories.sql
 *  - Un véhicule sans ligne dans cette table garde son seul categoryId (fonctionnement d'avant).
 */
export const VEHICLE_CATEGORIES_TABLE = 'driver_vehicle_categories';

/**
 * Condition SQL « le véhicule `alias` sert dans la catégorie :param »
 * COLLATE explicite : fonctionne même si les deux tables n'ont pas le même interclassement
 * (utf8mb4_unicode_ci / utf8mb4_0900_ai_ci).
 * (catégorie principale OU catégorie supplémentaire).
 */
export function vehicleInCategorySql(alias: string, param = 'categoryId'): string {
  return (
    `(${alias}.categoryId = :${param} OR EXISTS (SELECT 1 FROM \`${VEHICLE_CATEGORIES_TABLE}\` dvc ` +
    `WHERE dvc.vehicleId = ${alias}.id COLLATE utf8mb4_unicode_ci AND dvc.categoryId = :${param}))`
  );
}

/**
 * ✅ Places du véhicule : places passagers (chauffeur non compris).
 *    Véhicule sans valeur (seats NULL) → RIDE_DEFAULT_VEHICLE_SEATS (.env), 4 par défaut.
 */
export function defaultVehicleSeats(): number {
  const n = parseInt(String(process.env.RIDE_DEFAULT_VEHICLE_SEATS ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 4;
}

/** Places réelles d'un véhicule */
export function vehicleSeats(vehicle?: { seats?: number | null } | null): number {
  const n = Number(vehicle?.seats);
  return Number.isFinite(n) && n > 0 ? n : defaultVehicleSeats();
}

/** Condition SQL « le véhicule `alias` a au moins :param places » */
export function vehicleHasSeatsSql(alias: string, param = 'passengers'): string {
  return `COALESCE(${alias}.seats, ${defaultVehicleSeats()}) >= :${param}`;
}

/** multipart/form-data ou JSON : ["a","b"], "a,b" ou '["a","b"]' → tableau d'ids */
export function toIdArray({ value }: { value: any }): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  const s = String(value).trim();
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    } catch {
      /* format simple ci-dessous */
    }
  }
  return s.split(',').map((v) => v.trim()).filter(Boolean);
}

/** Ids des catégories du véhicule (principale en premier) */
export async function vehicleCategoryIds(
  manager: EntityManager,
  vehicle: { id: string; categoryId?: string | null },
): Promise<string[]> {
  const rows: { categoryId: string }[] = await manager.query(
    `SELECT categoryId FROM \`${VEHICLE_CATEGORIES_TABLE}\` WHERE vehicleId = ?`,
    [vehicle.id],
  );
  return [...new Set([vehicle.categoryId, ...rows.map((r) => r.categoryId)].filter(Boolean) as string[])];
}

/** Catégories (id, nom, image) de plusieurs véhicules — principale en premier */
export async function vehicleCategoriesMap(
  manager: EntityManager,
  vehicles: { id: string; categoryId?: string | null }[],
): Promise<Map<string, { id: string; name: string | null; image: string | null; isMain: boolean }[]>> {
  const out = new Map<string, { id: string; name: string | null; image: string | null; isMain: boolean }[]>();
  if (!vehicles.length) return out;
  const ids = vehicles.map((v) => v.id);
  const extra: { vehicleId: string; categoryId: string }[] = await manager.query(
    `SELECT vehicleId, categoryId FROM \`${VEHICLE_CATEGORIES_TABLE}\` WHERE vehicleId IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  const allCatIds = [...new Set([...vehicles.map((v) => v.categoryId), ...extra.map((e) => e.categoryId)].filter(Boolean) as string[])];
  const cats: { id: string; name: string | null; image: string | null }[] = allCatIds.length
    ? await manager.query(
        `SELECT id, name, image FROM \`category\` WHERE id IN (${allCatIds.map(() => '?').join(',')})`,
        allCatIds,
      )
    : [];
  const byId = new Map(cats.map((c) => [c.id, c]));
  for (const v of vehicles) {
    const list = [...new Set([v.categoryId, ...extra.filter((e) => e.vehicleId === v.id).map((e) => e.categoryId)].filter(Boolean) as string[])];
    out.set(
      v.id,
      list.map((id) => ({
        id,
        name: byId.get(id)?.name ?? null,
        image: byId.get(id)?.image ?? null,
        isMain: id === v.categoryId,
      })),
    );
  }
  return out;
}

/**
 * Enregistre les catégories du véhicule (remplace les anciennes).
 * La catégorie principale (categoryId) est toujours incluse.
 */
export async function saveVehicleCategories(
  manager: EntityManager,
  vehicleId: string,
  mainCategoryId: string,
  categoryIds?: string[] | null,
): Promise<string[]> {
  const ids = [...new Set([mainCategoryId, ...(categoryIds ?? [])].filter(Boolean))];
  if (!ids.length) return [];
  const found: { id: string }[] = await manager.query(
    `SELECT id FROM \`category\` WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  const missing = ids.filter((id) => !found.some((f) => f.id === id));
  if (missing.length) throw new BadRequestException(`Catégorie(s) introuvable(s) : ${missing.join(', ')}`);

  await manager.transaction(async (m) => {
    await m.query(`DELETE FROM \`${VEHICLE_CATEGORIES_TABLE}\` WHERE vehicleId = ?`, [vehicleId]);
    await m.query(
      `INSERT INTO \`${VEHICLE_CATEGORIES_TABLE}\` (vehicleId, categoryId, createdAt) VALUES ${ids.map(() => '(?, ?, NOW())').join(',')}`,
      ids.flatMap((id) => [vehicleId, id]),
    );
  });
  return ids;
}
