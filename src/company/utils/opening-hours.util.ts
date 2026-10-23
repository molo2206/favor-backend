import { BadRequestException } from '@nestjs/common';

/** Jours d'ouverture enregistrés en base (ordre de la semaine) */
export const WEEK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

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

/**
 * Accepte : ["MONDAY","FRIDAY"] | "lundi,mardi" | '["MONDAY"]' (form-data) | "MONDAY-FRIDAY" (plage).
 * Renvoie undefined si rien n'est envoyé, [] pour « aucun jour ».
 */
export function normalizeOpeningDays(value: any): WeekDay[] | undefined {
  if (value === undefined || value === null || value === '' || value === 'null') return undefined;
  let list: any[] = [];
  if (Array.isArray(value)) list = value;
  else if (typeof value === 'string') {
    const raw = value.trim();
    if (raw.startsWith('[')) {
      try {
        list = JSON.parse(raw);
      } catch {
        throw new BadRequestException('opening_days : JSON invalide');
      }
    } else list = raw.split(/[,;|\s]+/);
  } else throw new BadRequestException('opening_days : format invalide');

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
    const day = DAY_ALIASES[token] ?? (WEEK_DAYS.includes(token.toUpperCase() as WeekDay) ? (token.toUpperCase() as WeekDay) : undefined);
    if (!day) throw new BadRequestException(`opening_days : jour inconnu « ${item} »`);
    days.add(day);
  }
  return WEEK_DAYS.filter((d) => days.has(d));
}

/** "8:00" | "08:00" | "08h00" | "0800" → "08:00" ; undefined si vide */
export function normalizeTime(value: any, field: string): string | undefined {
  if (value === undefined || value === null || value === '' || value === 'null') return undefined;
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

/**
 * Normalise les 3 champs d'un DTO (création / mise à jour) et vérifie la cohérence.
 * Une heure de fermeture plus petite que l'ouverture = ouverture de nuit (ex. 18:00 → 02:00).
 */
export function normalizeOpeningFields(dto: any): {
  opening_days?: WeekDay[];
  opening_time?: string;
  closing_time?: string;
} {
  const out: { opening_days?: WeekDay[]; opening_time?: string; closing_time?: string } = {};
  const days = normalizeOpeningDays(dto?.opening_days);
  const open = normalizeTime(dto?.opening_time, 'opening_time');
  const close = normalizeTime(dto?.closing_time, 'closing_time');
  if (days !== undefined) out.opening_days = days;
  if (open !== undefined) out.opening_time = open;
  if (close !== undefined) out.closing_time = close;
  if (open && close && open === close && open !== '00:00') {
    throw new BadRequestException("L'heure d'ouverture et l'heure de fermeture ne peuvent pas être identiques");
  }
  return out;
}

/** Jour (MONDAY…) et minutes depuis minuit dans un fuseau horaire */
function nowIn(timeZone: string): { day: WeekDay; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Lubumbashi',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    day: get('weekday').toUpperCase() as WeekDay,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/**
 * L'entreprise est-elle ouverte maintenant ?
 * null = horaires non renseignés (on ne sait pas).
 * Fuseau : COMPANY_DEFAULT_TIMEZONE (.env), par défaut Africa/Lubumbashi.
 */
export function isOpenNow(
  company: { opening_days?: string[] | null; opening_time?: string | null; closing_time?: string | null },
  timeZone: string = process.env.COMPANY_DEFAULT_TIMEZONE || 'Africa/Lubumbashi',
): boolean | null {
  const days = company?.opening_days;
  const open = company?.opening_time;
  const close = company?.closing_time;
  if ((!days || !days.length) && !open && !close) return null;

  const now = nowIn(timeZone);
  const dayIdx = WEEK_DAYS.indexOf(now.day);
  const prevDay = WEEK_DAYS[(dayIdx + 6) % 7];
  const openDays = days && days.length ? days : [...WEEK_DAYS];

  if (!open || !close) return openDays.includes(now.day);

  const o = toMinutes(open);
  const c = toMinutes(close === '24:00' ? '24:00' : close);
  if (o === c) return openDays.includes(now.day); // 00:00 → 00:00 = 24 h/24
  if (o < c) return openDays.includes(now.day) && now.minutes >= o && now.minutes < c;
  // Ouverture de nuit : soit après l'ouverture aujourd'hui, soit avant la fermeture d'hier
  return (openDays.includes(now.day) && now.minutes >= o) || (openDays.includes(prevDay) && now.minutes < c);
}
