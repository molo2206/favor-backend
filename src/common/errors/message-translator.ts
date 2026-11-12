import { ERROR_MESSAGES_CATALOG, SupportedLang } from './error-messages.catalog';
import { HARDCODED_MESSAGES, HARDCODED_PATTERNS } from './hardcoded-messages.catalog';

export const SUPPORTED_MESSAGE_LANGS: SupportedLang[] = ['fr', 'en', 'es', 'sw', 'ar'];

type CompiledPattern = { re: RegExp; t: Record<SupportedLang, string> };

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let compiled: CompiledPattern[] | null = null;

/** Modèles « Véhicule {0} non trouvé » → expression régulière (compilés une seule fois) */
function patterns(): CompiledPattern[] {
  if (compiled) return compiled;
  compiled = Object.entries(HARDCODED_PATTERNS)
    .map(([source, t]) => {
      const parts = source.split(/\{\d+\}/);
      if (parts.length < 2) return null;
      const re = new RegExp(`^${parts.map(escapeRe).join('([\\s\\S]*?)')}$`);
      return { re, t };
    })
    .filter((p): p is CompiledPattern => !!p)
    // Les modèles les plus longs (plus précis) d'abord
    .sort((a, b) => b.re.source.length - a.re.source.length);
  return compiled;
}

/**
 * ✅ Traduit un message écrit en dur dans le code (erreur ou succès) dans la langue demandée.
 * 1) catalogue d'origine (error-messages.catalog.ts) ; 2) catalogue complémentaire ; 3) modèles avec valeurs variables.
 * Renvoie null si le message est inconnu (il est alors laissé tel quel).
 */
export function translateHardcodedMessage(message: unknown, lang: SupportedLang): string | null {
  if (typeof message !== 'string' || !message) return null;
  const direct = ERROR_MESSAGES_CATALOG[message] ?? HARDCODED_MESSAGES[message];
  if (direct) return direct[lang] ?? direct.fr ?? message;

  if (message.length > 2000) return null;
  for (const p of patterns()) {
    const m = message.match(p.re);
    if (!m) continue;
    const tpl = p.t[lang] ?? p.t.fr;
    if (!tpl) return null;
    return tpl.replace(/\{(\d+)\}/g, (_, i) => m[Number(i) + 1] ?? '');
  }
  return null;
}

/** Langue de la requête : ?lang, x-lang, Accept-Language, langue de l'utilisateur, sinon fr */
export function requestLang(req: any): SupportedLang {
  const candidates = [req?.query?.lang, req?.headers?.['x-lang'], req?.headers?.['accept-language'], req?.currentUser?.preferredLanguage];
  for (const c of candidates) {
    if (typeof c !== 'string' || !c.trim()) continue;
    const l = c.split(',')[0].split(';')[0].trim().toLowerCase().slice(0, 2) as SupportedLang;
    if (SUPPORTED_MESSAGE_LANGS.includes(l)) return l;
  }
  return 'fr';
}
