import { Transform, Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** ✅ "A,B" ou ["A","B"] ou A → ['A','B'] (filtres à plusieurs valeurs) */
export const toList = ({ value }: { value: any }): string[] | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    const arr = Array.isArray(value) ? value : String(value).split(',');
    const out = arr.map((v) => String(v).trim().toUpperCase()).filter(Boolean);
    return out.length ? out : undefined;
};

export const trim = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim() || undefined : value);

/** "true"/"1" → true ; "false"/"0" → false */
export const toBoolStr = ({ value }: { value: any }) =>
    value === undefined || value === null || value === '' ? undefined : value === true || value === 'true' || value === '1' ? 'true' : 'false';

/** ✅ Pagination commune (PaginatedResponseDto) : page ≥ 1, limit 1 à 100 (10 par défaut) */
export class PageQueryDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
    @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value)) @IsIn(['ASC', 'DESC']) sortOrder?: 'ASC' | 'DESC';
}

/** ✅ Filtres de période (création) */
export class PeriodQueryDto extends PageQueryDto {
    /** Créé à partir de (AAAA-MM-JJ ou date ISO) */
    @IsOptional() @IsDateString() from?: string;
    /** Créé jusqu'à (inclus) */
    @IsOptional() @IsDateString() to?: string;
    /** Texte libre */
    @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
}

export function pageParams(page?: number, limit?: number, def = 10, max = 100) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(max, Math.max(1, Number(limit) || def));
    return { page: p, limit: l, skip: (p - 1) * l };
}

/** Fin de journée si la date est AAAA-MM-JJ */
export function endOf(date: string): Date {
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T23:59:59.999`) : new Date(date);
}

export function startOf(date: string): Date {
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date(date);
}

