import { BadRequestException } from '@nestjs/common';

/**
 * ✅ HORAIRES D'OUVERTURE « COMME GOOGLE »
 *
 *  - horaires PAR JOUR, avec PLUSIEURS plages (ex. 08:00–12:00 et 14:00–18:00) ;
 *  - ouvert 24 h/24, fermé, ouverture de nuit (18:00 → 02:00) ;
 *  - HORAIRES EXCEPTIONNELS par date ou période (jours fériés, inventaire…) : fermé, 24 h ou plages spéciales ;
 *  - statut de l'établissement : en activité, fermé temporairement (jusqu'au …), fermé définitivement ;
 *  - FUSEAU HORAIRE de l'entreprise (Goma = Africa/Lubumbashi, Kinshasa = Africa/Kinshasa…) ;
 *  - calcul : ouvert maintenant ? « Ferme bientôt », « Ouvre bientôt », prochaine ouverture / fermeture,
 *    horaires du jour, semaine complète, prochains horaires exceptionnels — en 5 langues.
 *
 *  Compatibilité : les anciens champs opening_days / opening_time / closing_time restent acceptés ;
 *  sans horaires détaillés, ils servent à construire la semaine.
 */

/** Jours d'ouverture enregistrés en base (ordre de la semaine) */
export const WEEK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** Une plage horaire "HH:mm" → "HH:mm" (fermeture ≤ ouverture = après minuit ; "24:00" = minuit) */
export interface OpeningPeriod {
  open: string;
  close: string;
}
/** Semaine : chaque jour a 0 plage (fermé), une ou plusieurs plages */
export type WeeklyHours = Record<WeekDay, OpeningPeriod[]>;

/** Horaire exceptionnel : une date ou une période (date → endDate incluses) */
export interface SpecialHours {
  date: string; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD (incluse)
  closed?: boolean;
  open24h?: boolean;
  periods?: OpeningPeriod[];
  label?: string | null; // ex. « Noël », « Inventaire »
}

export const OPENING_STATUSES = ['OPERATIONAL', 'TEMPORARILY_CLOSED', 'PERMANENTLY_CLOSED'] as const;
export type OpeningStatus = (typeof OPENING_STATUSES)[number];

export type OpenState =
  | 'OPEN'
  | 'OPEN_24H'
  | 'CLOSES_SOON'
  | 'CLOSED'
  | 'OPENS_SOON'
  | 'TEMPORARILY_CLOSED'
  | 'PERMANENTLY_CLOSED'
  | 'UNKNOWN';

/** Champs de l'entreprise utilisés par le calcul */
export interface OpeningSource {
  opening_days?: string[] | null;
  opening_time?: string | null;
  closing_time?: string | null;
  opening_hours?: Partial<Record<WeekDay, OpeningPeriod[]>> | null;
  special_hours?: SpecialHours[] | null;
  opening_status?: string | null;
  reopen_date?: string | Date | null;
  timezone?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

/** Délai (minutes) pour « Ferme bientôt » / « Ouvre bientôt » (Google : 1 h) */
const SOON_MINUTES = Number(process.env.COMPANY_SOON_MINUTES || 60);
const DEFAULT_TZ = () => process.env.COMPANY_DEFAULT_TIMEZONE || 'Africa/Lubumbashi';

// ============================================================
// LECTURE DES ENTRÉES (formulaires, form-data, JSON)
// ============================================================
/** Noms acceptés à l'entrée (anglais, français, swahili, espagnol, abréviations, numéros 1-7) */
const DAY_ALIASES: Record<string, WeekDay> = {
  monday: 'MONDAY', mon: 'MONDAY', lundi: 'MONDAY', lun: 'MONDAY', jumatatu: 'MONDAY', lunes: 'MONDAY', '1': 'MONDAY',
  tuesday: 'TUESDAY', tue: 'TUESDAY', mardi: 'TUESDAY', mar: 'TUESDAY', jumanne: 'TUESDAY', martes: 'TUESDAY', '2': 'TUESDAY',
  wednesday: 'WEDNESDAY', wed: 'WEDNESDAY', mercredi: 'WEDNESDAY', mer: 'WEDNESDAY', jumatano: 'WEDNESDAY', miercoles: 'WEDNESDAY', '3': 'WEDNESDAY',
  thursday: 'THURSDAY', thu: 'THURSDAY', jeudi: 'THURSDAY', jeu: 'THURSDAY', alhamisi: 'THURSDAY', jueves: 'THURSDAY', '4': 'THURSDAY',
  friday: 'FRIDAY', fri: 'FRIDAY', vendredi: 'FRIDAY', ven: 'FRIDAY', ijumaa: 'FRIDAY', viernes: 'FRIDAY', '5': 'FRIDAY',
  saturday: 'SATURDAY', sat: 'SATURDAY', samedi: 'SATURDAY', sam: 'SATURDAY', jumamosi: 'SATURDAY', sabado: 'SATURDAY', '6': 'SATURDAY',
  sunday: 'SUNDAY', sun: 'SUNDAY', dimanche: 'SUNDAY', dim: 'SUNDAY', jumapili: 'SUNDAY', domingo: 'SUNDAY', '7': 'SUNDAY', '0': 'SUNDAY',
};

const strip = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const isEmpty = (v: any) => v === undefined || v === null || v === '' || v === 'null';

function parseJsonIfString(value: any, field: string): any {
  if (typeof value !== 'string') return value;
  const raw = value.trim();
  if (!raw.startsWith('[') && !raw.startsWith('{')) return value;
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestException(`${field} : JSON invalide`);
  }
}

function dayOf(value: any, field: string): WeekDay {
  const token = strip(String(value ?? ''));
  const day = DAY_ALIASES[token] ?? (WEEK_DAYS.includes(token.toUpperCase() as WeekDay) ? (token.toUpperCase() as WeekDay) : undefined);
  if (!day) throw new BadRequestException(`${field} : jour inconnu « ${value} »`);
  return day;
}

/**
 * Accepte : ["MONDAY","FRIDAY"] | "lundi,mardi" | '["MONDAY"]' (form-data) | "MONDAY-FRIDAY" (plage).
 * Renvoie undefined si rien n'est envoyé, [] pour « aucun jour ».
 */
export function normalizeOpeningDays(value: any): WeekDay[] | undefined {
  if (isEmpty(value)) return undefined;
  let list: any[] = [];
  const parsed = parseJsonIfString(value, 'opening_days');
  if (Array.isArray(parsed)) list = parsed;
  else if (typeof parsed === 'string') list = parsed.trim().split(/[,;|\s]+/);
  else throw new BadRequestException('opening_days : format invalide');

  const days = new Set<WeekDay>();
  for (const item of list) {
    const token = strip(String(item ?? ''));
    if (!token) continue;
    const range = token.split('-');
    if (range.length === 2 && DAY_ALIASES[range[0]] && DAY_ALIASES[range[1]]) {
      let i = WEEK_DAYS.indexOf(DAY_ALIASES[range[0]]);
      const end = WEEK_DAYS.indexOf(DAY_ALIASES[range[1]]);
      for (let n = 0; n < 7; n++) {
        days.add(WEEK_DAYS[i]);
        if (i === end) break;
        i = (i + 1) % 7;
      }
      continue;
    }
    days.add(dayOf(item, 'opening_days'));
  }
  return WEEK_DAYS.filter((d) => days.has(d));
}

/** "8:00" | "08:00" | "08h00" | "0800" | "8h" → "08:00" ; undefined si vide */
export function normalizeTime(value: any, field: string): string | undefined {
  if (isEmpty(value)) return undefined;
  const raw = String(value).trim().toLowerCase().replace(/\s+/g, '').replace('h', ':').replace(/:$/, '');
  const m = raw.match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) throw new BadRequestException(`${field} : heure invalide « ${value} » (format HH:mm)`);
  const h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  if (h > 24 || min > 59 || (h === 24 && min > 0)) {
    throw new BadRequestException(`${field} : heure invalide « ${value} » (format HH:mm)`);
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const FULL_DAY: OpeningPeriod[] = [{ open: '00:00', close: '24:00' }];

/** Une plage : {open, close} | "08:00-18:00" | ["08:00","18:00"] */
function normalizePeriod(value: any, field: string): OpeningPeriod {
  let open: any;
  let close: any;
  if (typeof value === 'string') [open, close] = value.split(/\s*[-–—à>]\s*|\s+to\s+/i);
  else if (Array.isArray(value)) [open, close] = value;
  else if (value && typeof value === 'object') {
    open = value.open ?? value.opening_time ?? value.from ?? value.start;
    close = value.close ?? value.closing_time ?? value.to ?? value.end;
  }
  const o = normalizeTime(open, `${field}.open`);
  const c = normalizeTime(close, `${field}.close`);
  if (!o || !c) throw new BadRequestException(`${field} : indiquez l'heure d'ouverture et de fermeture`);
  if (o === c && o !== '00:00') throw new BadRequestException(`${field} : ouverture et fermeture identiques (${o})`);
  if (o === '00:00' && (c === '00:00' || c === '24:00')) return { open: '00:00', close: '24:00' };
  if (o === '24:00') throw new BadRequestException(`${field} : l'ouverture ne peut pas être 24:00`);
  return { open: o, close: c };
}

/** Intervalle en minutes depuis minuit (fermeture après minuit → > 1440) */
function span(p: OpeningPeriod): [number, number] {
  const o = toMinutes(p.open);
  let c = toMinutes(p.close);
  if (c <= o) c += 1440;
  return [o, c];
}

/** Plages d'un jour : triées, sans chevauchement */
function normalizeDayPeriods(value: any, field: string): OpeningPeriod[] {
  const v = parseJsonIfString(value, field);
  if (isEmpty(v) || v === false) return [];
  if (typeof v === 'string') {
    const t = strip(v);
    if (['closed', 'ferme', 'fermee', 'imefungwa', 'cerrado', 'off', 'none', 'aucun'].includes(t)) return [];
    if (['24h', '24/24', '24h/24', 'open24h', '24', 'ouvert24h', 'always'].includes(t.replace(/\s+/g, ''))) return [...FULL_DAY];
    return sortAndCheck(v.split(/[,;]/).map((s, i) => normalizePeriod(s, `${field}[${i}]`)), field);
  }
  if (Array.isArray(v)) return sortAndCheck(v.map((p, i) => normalizePeriod(p, `${field}[${i}]`)), field);
  if (typeof v === 'object') {
    if (v.closed === true || v.closed === 'true') return [];
    if (v.open24h === true || v.open24h === 'true' || v.is24h === true) return [...FULL_DAY];
    if (v.periods !== undefined) return normalizeDayPeriods(v.periods, field);
    return [normalizePeriod(v, field)];
  }
  throw new BadRequestException(`${field} : format invalide`);
}

function sortAndCheck(periods: OpeningPeriod[], field: string): OpeningPeriod[] {
  if (periods.some((p) => p.open === '00:00' && p.close === '24:00')) return [...FULL_DAY];
  const sorted = [...periods].sort((a, b) => toMinutes(a.open) - toMinutes(b.open));
  for (let i = 1; i < sorted.length; i++) {
    if (span(sorted[i - 1])[1] > span(sorted[i])[0]) {
      throw new BadRequestException(`${field} : les plages ${sorted[i - 1].open}–${sorted[i - 1].close} et ${sorted[i].open}–${sorted[i].close} se chevauchent`);
    }
  }
  if (sorted.length > 6) throw new BadRequestException(`${field} : 6 plages au maximum par jour`);
  return sorted;
}

/**
 * Semaine détaillée. Formats acceptés :
 *  - { "MONDAY": [{ "open": "08:00", "close": "12:00" }, { "open": "14:00", "close": "18:00" }], "SUNDAY": "closed", "SATURDAY": "24h" }
 *  - { "lundi": "08:00-12:00,14:00-18:00" }
 *  - [{ "day": "MONDAY", "closed": false, "open24h": false, "periods": [{ "open": "08:00", "close": "18:00" }] }, …]
 * Les jours absents sont FERMÉS. undefined = non envoyé ; null = effacer.
 */
export function normalizeWeeklyHours(value: any): WeeklyHours | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === 'null' || value === '') return null;
  const v = parseJsonIfString(value, 'opening_hours');
  const week = Object.fromEntries(WEEK_DAYS.map((d) => [d, [] as OpeningPeriod[]])) as WeeklyHours;
  if (Array.isArray(v)) {
    for (const [i, item] of v.entries()) {
      const days = item?.days ? normalizeOpeningDays(item.days) ?? [] : [dayOf(item?.day, `opening_hours[${i}].day`)];
      const periods = normalizeDayPeriods(item, `opening_hours[${i}]`);
      for (const d of days) week[d] = sortAndCheck([...week[d], ...periods], `opening_hours.${d}`);
    }
  } else if (v && typeof v === 'object') {
    for (const [k, periods] of Object.entries(v)) {
      const d = dayOf(k, 'opening_hours');
      week[d] = normalizeDayPeriods(periods, `opening_hours.${d}`);
    }
  } else {
    throw new BadRequestException('opening_hours : format invalide');
  }
  return week;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function normalizeDate(value: any, field: string): string {
  const s = String(value ?? '').trim().slice(0, 10);
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw new BadRequestException(`${field} : date invalide « ${value} » (format AAAA-MM-JJ)`);
  }
  return s;
}

/**
 * Horaires exceptionnels :
 *  [{ "date": "2026-12-25", "closed": true, "label": "Noël" },
 *   { "date": "2026-12-31", "periods": [{ "open": "08:00", "close": "14:00" }] },
 *   { "date": "2027-01-02", "endDate": "2027-01-05", "closed": true, "label": "Inventaire" }]
 */
export function normalizeSpecialHours(value: any): SpecialHours[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === 'null' || value === '') return null;
  const v = parseJsonIfString(value, 'special_hours');
  if (!Array.isArray(v)) throw new BadRequestException('special_hours : une liste est attendue');
  const out: SpecialHours[] = v.map((item, i) => {
    const f = `special_hours[${i}]`;
    const date = normalizeDate(item?.date, `${f}.date`);
    const endDate = isEmpty(item?.endDate ?? item?.end_date) ? null : normalizeDate(item.endDate ?? item.end_date, `${f}.endDate`);
    if (endDate && endDate < date) throw new BadRequestException(`${f} : la date de fin est avant la date de début`);
    if (endDate && (Date.parse(endDate) - Date.parse(date)) / 86400000 > 366) {
      throw new BadRequestException(`${f} : période d'un an maximum`);
    }
    const periods = normalizeDayPeriods(item, f);
    const label = isEmpty(item?.label) ? null : String(item.label).trim().slice(0, 80);
    const open24h = periods.length === 1 && periods[0].open === '00:00' && periods[0].close === '24:00';
    return {
      date,
      endDate,
      closed: periods.length === 0,
      open24h,
      periods: open24h ? [] : periods,
      label,
    };
  });
  // Une date ne doit pas être couverte deux fois
  const covered = new Map<string, string>();
  for (const s of out) {
    for (const d of eachDate(s.date, s.endDate || s.date)) {
      if (covered.has(d)) throw new BadRequestException(`special_hours : la date ${d} est déjà définie`);
      covered.set(d, s.date);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function* eachDate(from: string, to: string) {
  let t = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  while (t <= end) {
    yield new Date(t).toISOString().slice(0, 10);
    t += 86400000;
  }
}

/** Fuseau IANA valide (ex. Africa/Lubumbashi) */
export function normalizeTimezone(value: any): string | null | undefined {
  if (value === undefined) return undefined;
  if (isEmpty(value)) return null;
  const tz = String(value).trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw new BadRequestException(`timezone : fuseau horaire inconnu « ${tz} » (ex. Africa/Lubumbashi, Africa/Kinshasa)`);
  }
  return tz;
}

export function normalizeOpeningStatus(value: any): OpeningStatus | undefined {
  if (isEmpty(value)) return undefined;
  const s = String(value).trim().toUpperCase();
  if (!(OPENING_STATUSES as readonly string[]).includes(s)) {
    throw new BadRequestException(`opening_status : valeur inconnue « ${value} » (${OPENING_STATUSES.join(', ')})`);
  }
  return s as OpeningStatus;
}

/**
 * Normalise les champs d'horaires d'un DTO (création / mise à jour) et vérifie la cohérence.
 * Anciens champs : opening_days, opening_time, closing_time.
 * Nouveaux champs : opening_hours, special_hours, opening_status, reopen_date, timezone.
 * Une valeur null efface le champ.
 */
export function normalizeOpeningFields(dto: any): Record<string, any> {
  const out: Record<string, any> = {};
  const days = normalizeOpeningDays(dto?.opening_days);
  const open = normalizeTime(dto?.opening_time, 'opening_time');
  const close = normalizeTime(dto?.closing_time, 'closing_time');
  if (days !== undefined) out.opening_days = days;
  if (open !== undefined) out.opening_time = open;
  if (close !== undefined) out.closing_time = close;
  if (open && close && open === close && open !== '00:00') {
    throw new BadRequestException("L'heure d'ouverture et l'heure de fermeture ne peuvent pas être identiques");
  }

  const weekly = normalizeWeeklyHours(dto?.opening_hours);
  if (weekly !== undefined) out.opening_hours = weekly;
  const special = normalizeSpecialHours(dto?.special_hours);
  if (special !== undefined) out.special_hours = special;
  const status = normalizeOpeningStatus(dto?.opening_status);
  if (status !== undefined) {
    out.opening_status = status;
    if (status !== 'TEMPORARILY_CLOSED') out.reopen_date = null;
  }
  if (dto?.reopen_date !== undefined) out.reopen_date = isEmpty(dto.reopen_date) ? null : normalizeDate(dto.reopen_date, 'reopen_date');
  const tz = normalizeTimezone(dto?.timezone);
  if (tz !== undefined) out.timezone = tz;
  return out;
}

// ============================================================
// FUSEAU HORAIRE
// ============================================================
const COUNTRY_TZ: Record<string, string> = {
  CD: 'Africa/Lubumbashi',
  COD: 'Africa/Lubumbashi',
  RW: 'Africa/Kigali',
  RWA: 'Africa/Kigali',
  BI: 'Africa/Bujumbura',
  BDI: 'Africa/Bujumbura',
  UG: 'Africa/Kampala',
  UGA: 'Africa/Kampala',
  KE: 'Africa/Nairobi',
  TZ: 'Africa/Dar_es_Salaam',
  BJ: 'Africa/Porto-Novo',
  BEN: 'Africa/Porto-Novo',
  CG: 'Africa/Brazzaville',
  CM: 'Africa/Douala',
  AE: 'Asia/Dubai',
  ARE: 'Asia/Dubai',
  ZM: 'Africa/Lusaka',
  AO: 'Africa/Luanda',
};

/**
 * Fuseau d'une entreprise : le sien, sinon celui du pays.
 * RDC : deux fuseaux — l'ouest (Kinshasa, Kongo-Central, Équateur… longitude < 21,5°) est en UTC+1.
 */
export function guessTimezone(countryCode?: string | null, longitude?: string | number | null): string {
  const code = String(countryCode || '').toUpperCase();
  const lon = Number(longitude);
  if ((code === 'CD' || code === 'COD') && Number.isFinite(lon) && lon > 0 && lon < 21.5) return 'Africa/Kinshasa';
  return COUNTRY_TZ[code] || DEFAULT_TZ();
}

function companyTimezone(c: OpeningSource): string {
  const tz = c?.timezone;
  if (tz) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return tz;
    } catch {
      /* fuseau invalide en base → défaut */
    }
  }
  return DEFAULT_TZ();
}

/** Date locale, jour et minutes dans un fuseau (à un instant donné) */
function localNow(timeZone: string, at: Date = new Date()) {
  let parts: Intl.DateTimeFormatPart[];
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  };
  try {
    parts = new Intl.DateTimeFormat('en-US', { ...opts, timeZone }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'Africa/Lubumbashi' }).formatToParts(at);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const minutes = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
  // Décalage du fuseau (minutes) : heure locale lue comme UTC − instant réel
  const localAsUtc = Date.parse(`${date}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00Z`);
  const offset = Math.round((localAsUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
  return { day: get('weekday').toUpperCase() as WeekDay, date, minutes, offset };
}

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const weekdayOf = (ymd: string): WeekDay => WEEK_DAYS[(new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7];

// ============================================================
// SEMAINE EFFECTIVE (nouveaux horaires, sinon anciens champs)
// ============================================================
export function effectiveWeekly(c: OpeningSource): WeeklyHours | null {
  const detailed = c?.opening_hours;
  if (detailed && typeof detailed === 'object' && Object.keys(detailed).length) {
    return Object.fromEntries(WEEK_DAYS.map((d) => [d, Array.isArray(detailed[d]) ? (detailed[d] as OpeningPeriod[]) : []])) as WeeklyHours;
  }
  const days = c?.opening_days;
  const open = c?.opening_time;
  const close = c?.closing_time;
  if ((!days || !days.length) && !open && !close) return null; // non renseigné
  const openDays = days && days.length ? days : [...WEEK_DAYS];
  let periods: OpeningPeriod[];
  if (!open || !close) periods = [...FULL_DAY];
  else if (open === close) periods = [...FULL_DAY]; // 00:00 → 00:00 = 24 h/24
  else periods = [{ open, close }];
  return Object.fromEntries(WEEK_DAYS.map((d) => [d, openDays.includes(d) ? periods : []])) as WeeklyHours;
}

/** Horaire exceptionnel couvrant une date */
function specialFor(c: OpeningSource, ymd: string): SpecialHours | null {
  for (const s of c?.special_hours || []) {
    if (!s?.date) continue;
    if (ymd >= s.date && ymd <= (s.endDate || s.date)) return s;
  }
  return null;
}

function periodsFor(c: OpeningSource, week: WeeklyHours | null, ymd: string): { periods: OpeningPeriod[]; special: SpecialHours | null } {
  const special = specialFor(c, ymd);
  if (special) {
    if (special.closed) return { periods: [], special };
    if (special.open24h) return { periods: [...FULL_DAY], special };
    return { periods: special.periods || [], special };
  }
  return { periods: week ? week[weekdayOf(ymd)] || [] : [], special: null };
}

// ============================================================
// TEXTES (5 langues)
// ============================================================
type Lang = 'fr' | 'en' | 'es' | 'sw' | 'ar';
const T: Record<Lang, Record<string, string>> = {
  fr: {
    OPEN: 'Ouvert', CLOSED: 'Fermé', OPEN_24H: 'Ouvert 24 h/24', CLOSES_SOON: 'Ferme bientôt', OPENS_SOON: 'Ouvre bientôt',
    TEMPORARILY_CLOSED: 'Fermé temporairement', PERMANENTLY_CLOSED: 'Fermé définitivement', UNKNOWN: 'Horaires non renseignés',
    closesAt: 'Ferme à {t}', opensAt: 'Ouvre à {t}', opensTomorrow: 'Ouvre demain à {t}', opensOn: 'Ouvre {d} à {t}',
    closesTomorrow: 'Ferme demain à {t}', closesOn: 'Ferme {d} à {t}', reopens: "Réouverture le {date}", closedDay: 'Fermé', allDay: 'Ouvert 24 h/24',
    MONDAY: 'lundi', TUESDAY: 'mardi', WEDNESDAY: 'mercredi', THURSDAY: 'jeudi', FRIDAY: 'vendredi', SATURDAY: 'samedi', SUNDAY: 'dimanche',
  },
  en: {
    OPEN: 'Open', CLOSED: 'Closed', OPEN_24H: 'Open 24 hours', CLOSES_SOON: 'Closes soon', OPENS_SOON: 'Opens soon',
    TEMPORARILY_CLOSED: 'Temporarily closed', PERMANENTLY_CLOSED: 'Permanently closed', UNKNOWN: 'Hours not provided',
    closesAt: 'Closes {t}', opensAt: 'Opens {t}', opensTomorrow: 'Opens {t} tomorrow', opensOn: 'Opens {t} {d}',
    closesTomorrow: 'Closes {t} tomorrow', closesOn: 'Closes {t} {d}', reopens: 'Reopens on {date}', closedDay: 'Closed', allDay: 'Open 24 hours',
    MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday', THURSDAY: 'Thursday', FRIDAY: 'Friday', SATURDAY: 'Saturday', SUNDAY: 'Sunday',
  },
  es: {
    OPEN: 'Abierto', CLOSED: 'Cerrado', OPEN_24H: 'Abierto 24 horas', CLOSES_SOON: 'Cierra pronto', OPENS_SOON: 'Abre pronto',
    TEMPORARILY_CLOSED: 'Cerrado temporalmente', PERMANENTLY_CLOSED: 'Cerrado permanentemente', UNKNOWN: 'Horario no indicado',
    closesAt: 'Cierra a las {t}', opensAt: 'Abre a las {t}', opensTomorrow: 'Abre mañana a las {t}', opensOn: 'Abre el {d} a las {t}',
    closesTomorrow: 'Cierra mañana a las {t}', closesOn: 'Cierra el {d} a las {t}', reopens: 'Reabre el {date}', closedDay: 'Cerrado', allDay: 'Abierto 24 horas',
    MONDAY: 'lunes', TUESDAY: 'martes', WEDNESDAY: 'miércoles', THURSDAY: 'jueves', FRIDAY: 'viernes', SATURDAY: 'sábado', SUNDAY: 'domingo',
  },
  sw: {
    OPEN: 'Imefunguliwa', CLOSED: 'Imefungwa', OPEN_24H: 'Wazi saa 24', CLOSES_SOON: 'Inafunga hivi karibuni', OPENS_SOON: 'Inafungua hivi karibuni',
    TEMPORARILY_CLOSED: 'Imefungwa kwa muda', PERMANENTLY_CLOSED: 'Imefungwa kabisa', UNKNOWN: 'Saa hazijawekwa',
    closesAt: 'Inafunga saa {t}', opensAt: 'Inafungua saa {t}', opensTomorrow: 'Inafungua kesho saa {t}', opensOn: 'Inafungua {d} saa {t}',
    closesTomorrow: 'Inafunga kesho saa {t}', closesOn: 'Inafunga {d} saa {t}', reopens: 'Itafunguliwa tena {date}', closedDay: 'Imefungwa', allDay: 'Wazi saa 24',
    MONDAY: 'Jumatatu', TUESDAY: 'Jumanne', WEDNESDAY: 'Jumatano', THURSDAY: 'Alhamisi', FRIDAY: 'Ijumaa', SATURDAY: 'Jumamosi', SUNDAY: 'Jumapili',
  },
  ar: {
    OPEN: 'مفتوح', CLOSED: 'مغلق', OPEN_24H: 'مفتوح 24 ساعة', CLOSES_SOON: 'يغلق قريبًا', OPENS_SOON: 'يفتح قريبًا',
    TEMPORARILY_CLOSED: 'مغلق مؤقتًا', PERMANENTLY_CLOSED: 'مغلق نهائيًا', UNKNOWN: 'لم يتم تحديد ساعات العمل',
    closesAt: 'يغلق الساعة {t}', opensAt: 'يفتح الساعة {t}', opensTomorrow: 'يفتح غدًا الساعة {t}', opensOn: 'يفتح يوم {d} الساعة {t}',
    closesTomorrow: 'يغلق غدًا الساعة {t}', closesOn: 'يغلق يوم {d} الساعة {t}', reopens: 'يعاد الافتتاح في {date}', closedDay: 'مغلق', allDay: 'مفتوح 24 ساعة',
    MONDAY: 'الاثنين', TUESDAY: 'الثلاثاء', WEDNESDAY: 'الأربعاء', THURSDAY: 'الخميس', FRIDAY: 'الجمعة', SATURDAY: 'السبت', SUNDAY: 'الأحد',
  },
};
const tr = (lang: string, key: string, vars: Record<string, string> = {}) => {
  const dict = T[(lang as Lang)] || T.fr;
  return (dict[key] ?? T.fr[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
};
const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const periodText = (periods: OpeningPeriod[], lang: string) => {
  if (!periods.length) return tr(lang, 'closedDay');
  if (periods.length === 1 && periods[0].open === '00:00' && periods[0].close === '24:00') return tr(lang, 'allDay');
  return periods.map((p) => `${p.open}–${p.close === '24:00' ? '00:00' : p.close}`).join(', ');
};

// ============================================================
// CALCUL DU STATUT (ouvert maintenant, prochaine ouverture / fermeture…)
// ============================================================
export interface OpeningInfo {
  isOpenNow: boolean | null;
  state: OpenState;
  /** Texte court comme Google : « Ouvert · Ferme à 18:00 », « Fermé · Ouvre demain à 08:00 » */
  label: string;
  stateLabel: string;
  detail: string | null;
  /** Prochaine fermeture / ouverture (heure locale de l'entreprise + instant UTC) */
  closesAt: { local: string; utc: string; time: string } | null;
  opensAt: { local: string; utc: string; time: string } | null;
  timezone: string;
  today: { date: string; day: WeekDay; dayLabel: string; text: string; periods: OpeningPeriod[]; special: SpecialHours | null };
  openingStatus: OpeningStatus;
  reopenDate: string | null;
}

/** Intervalles d'ouverture (minutes depuis minuit AUJOURD'HUI, heure locale), fusionnés, d'hier à J+8 */
function intervals(c: OpeningSource, week: WeeklyHours | null, today: string): [number, number][] {
  const list: [number, number][] = [];
  for (let d = -1; d <= 8; d++) {
    const { periods } = periodsFor(c, week, addDays(today, d));
    for (const p of periods) {
      const [o, cl] = span(p);
      list.push([d * 1440 + o, d * 1440 + cl]);
    }
  }
  list.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const iv of list) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([...iv] as [number, number]);
  }
  return merged;
}

export function computeOpeningInfo(c: OpeningSource, lang = 'fr', at: Date = new Date()): OpeningInfo {
  const timezone = companyTimezone(c);
  const now = localNow(timezone, at);
  const week = effectiveWeekly(c);
  const todayInfo = periodsFor(c, week, now.date);
  const openingStatus = (normalizeOpeningStatusSafe(c?.opening_status) || 'OPERATIONAL') as OpeningStatus;
  const reopenDate = c?.reopen_date ? String(c.reopen_date instanceof Date ? c.reopen_date.toISOString() : c.reopen_date).slice(0, 10) : null;

  const today = {
    date: now.date,
    day: now.day,
    dayLabel: tr(lang, now.day),
    text: periodText(todayInfo.periods, lang),
    periods: todayInfo.periods,
    special: todayInfo.special,
  };
  const point = (offsetMin: number) => {
    // Minuit pile compte pour la veille (« Ferme à 00:00 », pas « demain à 00:00 »)
    const labelShift = Math.floor((offsetMin - (offsetMin % 1440 === 0 ? 1 : 0)) / 1440);
    const dayShift = Math.floor(offsetMin / 1440);
    const date = addDays(now.date, dayShift);
    const time = hhmm(offsetMin);
    const local = `${date}T${time}`;
    const utc = new Date(Date.parse(`${local}:00Z`) - now.offset * 60000).toISOString();
    return { local, utc, time, dayShift: labelShift, day: weekdayOf(addDays(now.date, labelShift)) };
  };
  const base = { timezone, today, openingStatus, reopenDate, closesAt: null, opensAt: null };

  // Établissement fermé (temporairement / définitivement)
  const tempClosed = openingStatus === 'TEMPORARILY_CLOSED' && !(reopenDate && reopenDate <= now.date);
  if (openingStatus === 'PERMANENTLY_CLOSED' || tempClosed) {
    const state: OpenState = openingStatus === 'PERMANENTLY_CLOSED' ? 'PERMANENTLY_CLOSED' : 'TEMPORARILY_CLOSED';
    const detail = state === 'TEMPORARILY_CLOSED' && reopenDate ? tr(lang, 'reopens', { date: reopenDate }) : null;
    return { ...base, isOpenNow: false, state, stateLabel: tr(lang, state), detail, label: [tr(lang, state), detail].filter(Boolean).join(' · ') };
  }
  // Horaires non renseignés (ni semaine, ni horaire exceptionnel aujourd'hui)
  if (!week && !todayInfo.special) {
    return { ...base, isOpenNow: null, state: 'UNKNOWN', stateLabel: tr(lang, 'UNKNOWN'), detail: null, label: tr(lang, 'UNKNOWN') };
  }

  const ivs = intervals(c, week, now.date);
  const current = ivs.find(([s, e]) => s <= now.minutes && now.minutes < e);
  const horizon = 8 * 1440;
  const when = (p: ReturnType<typeof point>, k: 'opens' | 'closes') =>
    p.dayShift === 0
      ? tr(lang, `${k}At`, { t: p.time })
      : p.dayShift === 1
        ? tr(lang, `${k}Tomorrow`, { t: p.time })
        : tr(lang, `${k}On`, { t: p.time, d: tr(lang, p.day) });

  if (current) {
    const [, end] = current;
    if (end >= horizon) {
      return { ...base, isOpenNow: true, state: 'OPEN_24H', stateLabel: tr(lang, 'OPEN_24H'), detail: null, label: tr(lang, 'OPEN_24H') };
    }
    const p = point(end);
    const soon = end - now.minutes <= SOON_MINUTES;
    const state: OpenState = soon ? 'CLOSES_SOON' : 'OPEN';
    // Comme Google : « Ferme bientôt · 18:00 », « Ouvert · Ferme à 18:00 »
    const detail = soon ? p.time : when(p, 'closes');
    return {
      ...base,
      isOpenNow: true,
      state,
      stateLabel: tr(lang, state),
      detail,
      closesAt: { local: p.local, utc: p.utc, time: p.time },
      label: `${tr(lang, state)} · ${detail}`,
    };
  }

  const next = ivs.find(([s]) => s > now.minutes);
  if (!next) {
    // Aucune ouverture prévue dans les 8 prochains jours
    return { ...base, isOpenNow: false, state: 'CLOSED', stateLabel: tr(lang, 'CLOSED'), detail: null, label: tr(lang, 'CLOSED') };
  }
  const p = point(next[0]);
  const soon = next[0] - now.minutes <= SOON_MINUTES;
  const state: OpenState = soon ? 'OPENS_SOON' : 'CLOSED';
  // Comme Google : « Ouvre bientôt · 08:00 », « Fermé · Ouvre demain à 08:00 »
  const detail = soon ? p.time : when(p, 'opens');
  return {
    ...base,
    isOpenNow: false,
    state,
    stateLabel: tr(lang, state),
    detail,
    opensAt: { local: p.local, utc: p.utc, time: p.time },
    label: `${tr(lang, state)} · ${detail}`,
  };
}

function normalizeOpeningStatusSafe(v: any): OpeningStatus | null {
  const s = String(v || '').toUpperCase();
  return (OPENING_STATUSES as readonly string[]).includes(s) ? (s as OpeningStatus) : null;
}

/**
 * Horaires complets pour l'écran « Horaires » (comme la fiche Google) :
 * statut, semaine (aujourd'hui en premier ou lundi en premier), horaires exceptionnels à venir.
 */
export function openingSchedule(c: OpeningSource, lang = 'fr', at: Date = new Date()) {
  const info = computeOpeningInfo(c, lang, at);
  const week = effectiveWeekly(c);
  const now = localNow(info.timezone, at);
  // 7 prochains jours (aujourd'hui en premier), horaires exceptionnels appliqués — comme Google
  const next7 = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(now.date, i);
    const { periods, special } = periodsFor(c, week, date);
    const day = weekdayOf(date);
    return {
      date,
      day,
      dayLabel: tr(lang, day),
      isToday: i === 0,
      closed: periods.length === 0,
      open24h: periods.length === 1 && periods[0].open === '00:00' && periods[0].close === '24:00',
      periods,
      text: periodText(periods, lang),
      special: special ? { label: special.label ?? null, date: special.date, endDate: special.endDate ?? null } : null,
    };
  });
  // Semaine habituelle (lundi → dimanche), sans les exceptions
  const regular = WEEK_DAYS.map((day) => {
    const periods = week ? week[day] : [];
    return {
      day,
      dayLabel: tr(lang, day),
      closed: periods.length === 0,
      open24h: periods.length === 1 && periods[0].open === '00:00' && periods[0].close === '24:00',
      periods,
      text: week ? periodText(periods, lang) : tr(lang, 'UNKNOWN'),
    };
  });
  const upcomingSpecial = (c?.special_hours || [])
    .filter((s) => (s.endDate || s.date) >= now.date)
    .slice(0, 30)
    .map((s) => ({
      ...s,
      text: s.closed ? tr(lang, 'closedDay') : s.open24h ? tr(lang, 'allDay') : periodText(s.periods || [], lang),
    }));
  return {
    ...info,
    hasHours: !!week,
    next7Days: next7,
    weekly: regular,
    specialHours: upcomingSpecial,
    raw: {
      opening_hours: week,
      special_hours: c?.special_hours || [],
      opening_status: info.openingStatus,
      reopen_date: info.reopenDate,
      timezone: c?.timezone || null,
    },
  };
}

/**
 * L'entreprise est-elle ouverte maintenant ? (compatibilité)
 * null = horaires non renseignés (on ne sait pas).
 */
export function isOpenNow(company: OpeningSource, timeZone?: string): boolean | null {
  return computeOpeningInfo(timeZone ? { ...company, timezone: company?.timezone || timeZone } : company).isOpenNow;
}
