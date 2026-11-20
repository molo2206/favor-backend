// src/common/pagination/paginate.util.ts
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';

/**
 * ✅ Pagination standard du projet : { data, total, page, limit, totalPages } (PaginatedResponseDto).
 *    Toutes les listes renvoient : { message, data: PaginatedResponseDto }.
 */
export type PageQuery = { page?: any; limit?: any };

/** page / limit normalisés + décalage SQL */
export function pageParams(q: PageQuery | undefined, defLimit = 20, maxLimit = 100) {
  const page = Math.max(1, Math.floor(Number(q?.page) || 1));
  const limit = Math.min(maxLimit, Math.max(1, Math.floor(Number(q?.limit) || defLimit)));
  return { page, limit, skip: (page - 1) * limit };
}

/** Réponse paginée standard ; `extra` = champs supplémentaires conservés (compteurs, anciens noms…) */
export function paginated<T>(rows: T[], total: number, page: number, limit: number, extra?: Record<string, any>): PaginatedResponseDto<T> {
  const p = new PaginatedResponseDto<T>(rows, Number(total) || 0, page, limit);
  return extra ? Object.assign(p, extra) : p;
}

/** Pagination d'une liste déjà en mémoire */
export function paginateArray<T>(rows: T[], q: PageQuery | undefined, defLimit = 20, maxLimit = 100): PaginatedResponseDto<T> {
  const { page, limit, skip } = pageParams(q, defLimit, maxLimit);
  return paginated(rows.slice(skip, skip + limit), rows.length, page, limit);
}

/** La requête demande une page (page ou limit présent) */
export function wantsPage(q: PageQuery | undefined): boolean {
  const has = (v: any) => v !== undefined && v !== null && String(v).trim() !== '';
  return !!q && (has(q.page) || has(q.limit));
}
