import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { Brackets, ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/**
 * ✅ RECHERCHE INTELLIGENTE — utilitaires communs
 *
 *  1) cleanSearchInput  : « mol! » → « mol », « (iphone 13) ?? » → « iphone 13 »
 *     (garde @ . + - _ / & ' utiles pour e-mails, téléphones, numéros de suivi, « l'eau »)
 *  2) searchTokens      : mots normalisés (minuscules, sans accents, sans mots vides)
 *  3) smartFind         : recherche par mots dans n'importe quel ordre, avec repli progressif :
 *        niveau 1 : TOUS les mots (singulier/pluriel tolérés)
 *        niveau 2 : AU MOINS UN mot
 *        niveau 3 : tolérance aux fautes (début du mot : « telephonne » → « telepho… »)
 *  4) rankBySearch      : tri par pertinence (nom exact > commence par > contient…)
 */

/** Noms des paramètres de recherche nettoyés automatiquement sur TOUTES les routes */
export const SEARCH_PARAM_KEYS = new Set([
  'search',
  'q',
  'query',
  'keyword',
  'keywords',
  'term',
  'searchTerm',
  'searchterm',
  's',
  'kw',
  'k',
]);

/** Caractères sans intérêt pour une recherche (toujours retirés) */
const NOISE = /[!?¡¿,;:"«»“”„()[\]{}*#~`^<>|=$%\\…•·°§¤€£¥]+/g;
/** Émojis et symboles pictographiques */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
/** Caractères gardés seulement À L'INTÉRIEUR d'un mot */
const EDGE = /^[.\-_/&']+|[.\-_/&']+$/g;

/** Nettoie ce que l'utilisateur tape : « mol! » → « mol » */
export function cleanSearchInput(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  let s = String(raw).normalize('NFC');
  s = s.replace(/[\u0000-\u001F\u007F]/g, ' ');
  s = s.replace(/[’‘`´]/g, "'");
  s = s.replace(EMOJI, ' ').replace(NOISE, ' ');
  return s
    .split(/\s+/)
    .map((w) => {
      const plus = w.startsWith('+') && /\d/.test(w) ? '+' : ''; // +243… (téléphone)
      const t = w.replace(/^\++/, '').replace(EDGE, '');
      return t ? plus + t : '';
    })
    .filter(Boolean)
    .join(' ')
    .slice(0, 200);
}

/** Minuscules + sans accents : « Élégant » → « elegant » */
export function foldText(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const STOP_WORDS = new Set([
  // fr
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'd', 'et', 'ou', 'a', 'au', 'aux', 'en', 'pour', 'par', 'avec', 'sur', 'dans',
  // en
  'the', 'an', 'of', 'and', 'or', 'for', 'with', 'in', 'on', 'to',
  // sw / es
  'na', 'ya', 'wa', 'el', 'los', 'las', 'y', 'con', 'para',
]);

/** Mots de la recherche : normalisés, sans doublons ni mots vides (max 8) */
export function searchTokens(raw: unknown): string[] {
  const clean = foldText(cleanSearchInput(raw));
  const words = clean
    .split(/\s+/)
    .map((w) => w.replace(/'/g, ' ').trim())
    .flatMap((w) => w.split(/\s+/))
    .filter(Boolean);
  const unique = [...new Set(words)];
  const meaningful = unique.filter((w) => !STOP_WORDS.has(w));
  return (meaningful.length ? meaningful : unique).slice(0, 8);
}

/** Échappe les jokers de LIKE (% et _) */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Formes acceptées d'un mot selon le niveau (pluriel, fautes de frappe) */
export function tokenVariants(token: string, level: 1 | 2 | 3): string[] {
  const out = new Set<string>([token]);
  // singulier / pluriel : « chaussures » ↔ « chaussure », « bijoux » ↔ « bijou »
  if (token.length > 3 && /[sx]$/.test(token)) out.add(token.slice(0, -1));
  if (token.length > 4 && /es$/.test(token)) out.add(token.slice(0, -2));
  // fautes de frappe : seulement pour les mots en lettres (pas les codes, e-mails, téléphones)
  if (level >= 3 && /^[a-z]+$/.test(token)) {
    // fautes de frappe : on garde le début du mot (au moins 4 lettres)
    if (token.length >= 5) out.add(token.slice(0, token.length - 1));
    if (token.length >= 7) out.add(token.slice(0, token.length - 2));
    if (token.length >= 9) out.add(token.slice(0, Math.ceil(token.length * 0.7)));
    // lettres doublées : « telephonne » → « telephone »
    const single = token.replace(/(.)\1+/g, '$1');
    if (single !== token && single.length >= 3) out.add(single);
  }
  // une forme qui en contient une autre est inutile (LIKE %x% couvre déjà)
  const list = [...out].sort((a, b) => a.length - b.length);
  return list.filter((v, i) => !list.slice(0, i).some((shorter) => v.includes(shorter)));
}

let paramSeq = 0;

/**
 * Condition SQL (Brackets) : chaque mot doit apparaître dans au moins une des colonnes.
 * `mode = 'any'` : au moins un des mots suffit.
 */
export function searchBrackets(columns: string[], tokens: string[], level: 1 | 2 | 3 = 1, mode: 'all' | 'any' = 'all'): Brackets {
  const prefix = `ss${(paramSeq = (paramSeq + 1) % 1e6)}_`;
  return new Brackets((outer) => {
    tokens.forEach((token, ti) => {
      const perToken = new Brackets((w) => {
        let first = true;
        tokenVariants(token, level).forEach((v, vi) => {
          const p = `${prefix}${ti}_${vi}`;
          for (const col of columns) {
            const cond = `LOWER(${col}) LIKE :${p}`;
            const params = { [p]: `%${escapeLike(v)}%` };
            if (first) w.where(cond, params);
            else w.orWhere(cond, params);
            first = false;
          }
        });
      });
      if (ti === 0) outer.where(perToken);
      else if (mode === 'all') outer.andWhere(perToken);
      else outer.orWhere(perToken);
    });
  });
}

/**
 * Exécute la requête avec repli progressif jusqu'à trouver des résultats :
 *   tous les mots → au moins un mot → tolérance aux fautes.
 * `qb` ne doit pas encore contenir la condition de recherche.
 */
export async function smartFind<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  columns: string[],
  raw: unknown,
  opts: { minLevel?: boolean } = {},
): Promise<{ items: T[]; level: number; tokens: string[] }> {
  const tokens = searchTokens(raw);
  if (!tokens.length) return { items: [], level: 0, tokens };
  const plans: [1 | 2 | 3, 'all' | 'any'][] = [
    [1, 'all'],
    ...(tokens.length > 1 ? ([[1, 'any']] as [1, 'any'][]) : []),
    [3, 'all'],
    ...(tokens.length > 1 ? ([[3, 'any']] as [3, 'any'][]) : []),
  ];
  for (const [i, [level, mode]] of plans.entries()) {
    const items = await qb.clone().andWhere(searchBrackets(columns, tokens, level, mode)).getMany();
    if (items.length || opts.minLevel) return { items, level: i + 1, tokens };
  }
  return { items: [], level: plans.length, tokens };
}

/**
 * Variante pour les listes PAGINÉES : choisit le niveau qui donne des résultats
 * (via COUNT), puis ajoute la condition à `qb` — la pagination reste à faire ensuite.
 */
export async function applySmartSearch<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  columns: string[],
  raw: unknown,
): Promise<{ tokens: string[]; level: number }> {
  const tokens = searchTokens(raw);
  if (!tokens.length) return { tokens, level: 0 };
  const plans: [1 | 2 | 3, 'all' | 'any'][] = [
    [1, 'all'],
    ...(tokens.length > 1 ? ([[1, 'any']] as [1, 'any'][]) : []),
    [3, 'all'],
    ...(tokens.length > 1 ? ([[3, 'any']] as [3, 'any'][]) : []),
  ];
  for (const [i, [level, mode]] of plans.entries()) {
    const isLast = i === plans.length - 1;
    if (isLast || (await qb.clone().andWhere(searchBrackets(columns, tokens, level, mode)).getCount()) > 0) {
      qb.andWhere(searchBrackets(columns, tokens, level, mode));
      return { tokens, level: i + 1 };
    }
  }
  return { tokens, level: 0 };
}

/** Score de pertinence d'un élément (plus haut = plus pertinent) */
export function searchScore(main: string | null | undefined, others: (string | null | undefined)[], tokens: string[]): number {
  const name = foldText(main ?? '');
  const phrase = tokens.join(' ');
  let score = 0;
  if (name === phrase) score += 100;
  else if (name.startsWith(phrase)) score += 60;
  else if (name.includes(phrase)) score += 40;
  const nameWords = name.split(/[^a-z0-9]+/);
  for (const t of tokens) {
    if (nameWords.includes(t)) score += 15;
    else if (nameWords.some((w) => w.startsWith(t))) score += 10;
    else if (name.includes(t)) score += 6;
    else if (others.some((o) => foldText(o ?? '').includes(t))) score += 2;
  }
  return score;
}

/** Trie par pertinence (stable : à score égal, l'ordre d'origine est gardé) */
export function rankBySearch<T>(items: T[], tokens: string[], main: (x: T) => string | null | undefined, others: (x: T) => (string | null | undefined)[] = () => []): T[] {
  if (!tokens.length) return items;
  return items
    .map((x, i) => ({ x, i, s: searchScore(main(x), others(x), tokens) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.x);
}

/**
 * ✅ Pipe global : nettoie automatiquement les paramètres de recherche
 * (?search=, ?q=, ?keyword=, ?term=, /search/:searchTerm …) sur TOUTES les routes.
 */
@Injectable()
export class SearchInputPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (metadata.type !== 'query' && metadata.type !== 'param') return value;
    if (metadata.data) {
      return SEARCH_PARAM_KEYS.has(metadata.data) && typeof value === 'string' ? cleanSearchInput(value) : value;
    }
    if (metadata.type === 'query' && value && typeof value === 'object' && !Array.isArray(value)) {
      let changed: Record<string, any> | null = null;
      for (const key of Object.keys(value)) {
        if (SEARCH_PARAM_KEYS.has(key) && typeof value[key] === 'string') {
          const next: Record<string, any> = changed ?? { ...value };
          next[key] = cleanSearchInput(value[key]);
          changed = next;
        }
      }
      return changed ?? value;
    }
    return value;
  }
}
