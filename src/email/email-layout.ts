/**
 * ============================================================
 * Mise en page commune de TOUS les e-mails Favor Help
 * ============================================================
 * Même identité que la facture de commande / d'expédition :
 *  - logo Favor Help + coordonnées de l'expéditeur
 *  - titre bleu #0118d8, numéro de référence, date, badge de statut
 *  - tableau à en-tête bleu, bloc de totaux avec la ligne finale en bleu
 *  - notes sur fond gris clair, remerciement, pied de page légal
 *
 * Écrit pour les clients e-mail (Gmail, Outlook, Apple Mail…) :
 * uniquement des tableaux et des styles en ligne (pas de flex, pas de CSS externe).
 * Toutes les valeurs texte sont échappées ; utilisez { html } pour du HTML déjà sûr.
 */

export type EmailTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export type EmailText = string | number | null | undefined | { html: string };

export interface BrandedEmailOptions {
  lang?: string;
  /** Texte d'aperçu affiché dans la boîte de réception (caché dans l'e-mail) */
  preheader?: string;
  /** Grand titre bleu en haut à droite (ex : « Facture », « Code de vérification ») */
  title: string;
  /** Petite ligne sous le titre (ex : « N° FAV-2026-00123 ») */
  reference?: string;
  /** Date affichée sous la référence */
  date?: string;
  badge?: { text: string; tone?: EmailTone };

  /** Bloc destinataire (comme « client » sur la facture) */
  recipient?: { label?: string; name?: string; lines?: (string | null | undefined)[] };

  greeting?: EmailText;
  paragraphs?: EmailText[];

  /** Gros encadré mis en avant : code OTP, code PIN, statut… */
  highlight?: { label?: string; value: string; hint?: EmailText; tone?: EmailTone; monospace?: boolean };

  /** Grille d'informations « libellé / valeur » (2 colonnes) */
  details?: { title?: string; items: { label: string; value: EmailText }[] };

  /** Tableau de lignes, même style que le tableau de la facture */
  table?: {
    title?: string;
    columns: string[];
    rows: EmailText[][];
    /** Colonnes alignées à droite à partir de cet index (montants) */
    alignRightFrom?: number;
  };

  /** Bloc de totaux (la ligne `strong` est affichée en bleu) */
  totals?: { label: string; value: string; strong?: boolean }[];

  /** Encadrés d'information (instructions de paiement, avertissements…) */
  boxes?: { title?: string; lines: EmailText[]; tone?: EmailTone }[];

  cta?: { label: string; url: string };

  notes?: { title?: string; lines: EmailText[] };

  /** Ajoute la mention « document PDF joint » */
  attachmentNote?: string;

  /** Textes de pied de page (voir getEmailBrand) */
  brand?: Partial<EmailBrand>;
}

export interface EmailBrand {
  logoUrl: string;
  senderName: string;
  senderLines: string[];
  thankYou: string;
  legalLines: string[];
  contactTitle: string;
  contactLine: string;
  autoMessage: string;
  rights: string;
}

/** Valeurs par défaut (identiques à la facture de commande) */
export const DEFAULT_EMAIL_BRAND: EmailBrand = {
  logoUrl: 'https://admin.favorhelp.com/logos/logo-dark.png',
  senderName: 'Favor Help',
  senderLines: [
    'Office 1, Q.Murara, 012, Goma',
    'Nord-Kivu, Congo-Kinshasa',
    'RCCM : CD/BN/RCCM/26-B-223',
    'N°Tel : +24397964940',
  ],
  thankYou: 'Merci pour votre confiance et votre collaboration.',
  legalLines: [
    'Favor Help — Office 1, Q.Murara, 012, Goma, Nord-Kivu, Congo-Kinshasa',
    'RCCM : 81194815700029 — N°Tel : +24397964940 — Email : contact@favorhelp.cd',
  ],
  contactTitle: "Besoin d'aide ?",
  contactLine: 'Service client : +243 991 225 122 · contact@favorhelp.com · www.favorhelp.com',
  autoMessage: 'Cet e-mail a été envoyé automatiquement, merci de ne pas y répondre.',
  rights: 'Tous droits réservés.',
};

/** Traduit les textes du pied de page (clés email.layout.* et order.email.legal_line_*) */
export function getEmailBrand(
  i18n: { translate: (key: string, lang: string, params?: Record<string, any>) => string },
  lang: string,
): EmailBrand {
  const t = (key: string, fallback: string) => {
    try {
      const value = i18n.translate(key, lang);
      return value && value !== key ? value : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    ...DEFAULT_EMAIL_BRAND,
    thankYou: t('order.email.thank_you_footer', DEFAULT_EMAIL_BRAND.thankYou),
    legalLines: [
      t('order.email.legal_line_1', DEFAULT_EMAIL_BRAND.legalLines[0]),
      t('order.email.legal_line_2', DEFAULT_EMAIL_BRAND.legalLines[1]),
    ],
    contactTitle: t('email.layout.contact_title', DEFAULT_EMAIL_BRAND.contactTitle),
    contactLine: t('email.layout.contact_line', DEFAULT_EMAIL_BRAND.contactLine),
    autoMessage: t('email.layout.auto_message', DEFAULT_EMAIL_BRAND.autoMessage),
    rights: t('email.layout.rights', DEFAULT_EMAIL_BRAND.rights),
  };
}

// ------------------------------------------------------------
// Couleurs (mêmes que la facture) — design volontairement sobre
// ------------------------------------------------------------
const C = {
  primary: '#0118d8',
  ink: '#1e293b',
  text: '#334155',
  muted: '#64748b',
  faint: '#94a3b8',
  border: '#e2e8f0',
  rowBorder: '#f1f5f9',
  page: '#ffffff', // fond blanc (plus de fond gris autour)
  soft: '#f8fafc',
  white: '#ffffff',
};

/** Couleur du texte de statut (pas de pastille, juste le mot en couleur) */
const TONE_TEXT: Record<EmailTone, string> = {
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
  info: C.primary,
  neutral: '#475569',
};

const FONT = `Arial, Helvetica, sans-serif`;

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function text(value: EmailText): string {
  if (value && typeof value === 'object' && 'html' in value) return value.html;
  return escapeHtml(value);
}

function isEmpty(value: EmailText): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'object') return !value.html;
  return String(value).trim() === '';
}

function heading(title?: string): string {
  if (!title) return '';
  return `<p style="margin:0 0 8px 0;font-size:13px;font-weight:bold;color:${C.ink};">${escapeHtml(title)}</p>`;
}

/**
 * Construit le HTML complet de l'e-mail.
 */
export function renderBrandedEmail(o: BrandedEmailOptions): string {
  const brand: EmailBrand = { ...DEFAULT_EMAIL_BRAND, ...(o.brand ?? {}) };
  const lang = o.lang || 'fr';
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const start = dir === 'rtl' ? 'right' : 'left';
  const end = dir === 'rtl' ? 'left' : 'right';
  const year = new Date().getFullYear();
  const pad = 'padding-left:32px;padding-right:32px;';
  const blocks: string[] = [];

  // ---------- Texte ----------
  const paragraphs = (o.paragraphs ?? []).filter((p) => !isEmpty(p));
  if (!isEmpty(o.greeting ?? null) || paragraphs.length) {
    blocks.push(`
      <tr><td style="${pad}padding-bottom:8px;font-size:14px;line-height:1.6;color:${C.text};">
        ${!isEmpty(o.greeting ?? null) ? `<p style="margin:0 0 12px 0;color:${C.ink};">${text(o.greeting ?? '')}</p>` : ''}
        ${paragraphs.map((p) => `<p style="margin:0 0 12px 0;">${text(p)}</p>`).join('')}
      </td></tr>`);
  }

  // ---------- Code / valeur importante ----------
  if (o.highlight?.value) {
    const mono = o.highlight.monospace !== false;
    const color = o.highlight.tone && o.highlight.tone !== 'info' ? TONE_TEXT[o.highlight.tone] : C.ink;
    blocks.push(`
      <tr><td style="${pad}padding-top:6px;padding-bottom:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};">
          <tr><td align="center" style="padding:18px 16px;">
            ${o.highlight.label ? `<p style="margin:0 0 6px 0;font-size:13px;color:${C.muted};">${escapeHtml(o.highlight.label)}</p>` : ''}
            <p style="margin:0;font-size:${mono ? '28px' : '18px'};font-weight:bold;letter-spacing:${mono ? '6px' : '0'};color:${color};font-family:${mono ? "'Courier New', Courier, monospace" : FONT};">${escapeHtml(o.highlight.value)}</p>
            ${!isEmpty(o.highlight.hint ?? null) ? `<p style="margin:8px 0 0 0;font-size:12px;color:${C.muted};">${text(o.highlight.hint ?? '')}</p>` : ''}
          </td></tr>
        </table>
      </td></tr>`);
  }

  // ---------- Informations (libellé : valeur) ----------
  const items = (o.details?.items ?? []).filter((i) => i && !isEmpty(i.value));
  if (items.length) {
    blocks.push(`
      <tr><td style="${pad}padding-bottom:20px;">
        ${heading(o.details?.title)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
          ${items
        .map(
          (it) => `<tr>
            <td style="padding:7px 0;border-bottom:1px solid ${C.rowBorder};color:${C.muted};width:45%;" valign="top">${escapeHtml(it.label)}</td>
            <td style="padding:7px 0;border-bottom:1px solid ${C.rowBorder};color:${C.ink};" align="${end}" valign="top">${text(it.value)}</td>
          </tr>`,
        )
        .join('')}
        </table>
      </td></tr>`);
  }

  // ---------- Tableau (identique à la facture) ----------
  if (o.table && o.table.columns.length) {
    const rightFrom = o.table.alignRightFrom ?? Number.MAX_SAFE_INTEGER;
    const th = o.table.columns
      .map(
        (c, i) =>
          `<th align="${i >= rightFrom ? end : start}" style="padding:7px 9px;background:${C.primary};color:${C.white};font-size:12px;font-weight:bold;white-space:nowrap;">${escapeHtml(c)}</th>`,
      )
      .join('');
    const body = o.table.rows.length
      ? o.table.rows
        .map(
          (row) =>
            `<tr>${row
              .map(
                (cell, i) =>
                  `<td align="${i >= rightFrom ? end : start}" style="padding:9px;border-bottom:1px solid ${C.rowBorder};font-size:12px;color:${C.text};">${text(cell)}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('')
      : `<tr><td colspan="${o.table.columns.length}" align="center" style="padding:12px;font-size:12px;color:${C.muted};">—</td></tr>`;
    blocks.push(`
      <tr><td style="${pad}padding-bottom:14px;">
        ${heading(o.table.title)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead><tr>${th}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </td></tr>`);
  }

  // ---------- Totaux (identique à la facture) ----------
  const totals = (o.totals ?? []).filter((t) => t && t.label);
  if (totals.length) {
    blocks.push(`
      <tr><td style="${pad}padding-bottom:20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" align="${end}" style="width:270px;max-width:100%;border:1px solid ${C.border};border-collapse:collapse;font-size:12px;">
          ${totals
        .map(
          (t, i) => `<tr>
              <td style="padding:8px 12px;font-weight:bold;${t.strong ? `background:${C.primary};color:${C.white};` : `color:${C.ink};${i ? `border-top:1px solid ${C.border};` : ''}`}">${escapeHtml(t.label)}</td>
              <td align="${end}" style="padding:8px 12px;white-space:nowrap;${t.strong ? `background:${C.primary};color:${C.white};font-weight:bold;` : `color:${C.ink};${i ? `border-top:1px solid ${C.border};` : ''}`}">${escapeHtml(t.value)}</td>
            </tr>`,
        )
        .join('')}
        </table>
      </td></tr>`);
  }

  // ---------- Informations complémentaires (paiement, avertissement…) ----------
  for (const box of o.boxes ?? []) {
    const lines = (box.lines ?? []).filter((l) => !isEmpty(l));
    if (!lines.length) continue;
    blocks.push(`
      <tr><td style="${pad}padding-bottom:14px;font-size:13px;line-height:1.6;color:${C.text};">
        ${box.title ? `<p style="margin:0 0 4px 0;font-weight:bold;color:${box.tone === 'warning' || box.tone === 'danger' ? TONE_TEXT[box.tone] : C.ink};">${escapeHtml(box.title)}</p>` : ''}
        ${lines.map((l) => `<p style="margin:0 0 2px 0;">${text(l)}</p>`).join('')}
      </td></tr>`);
  }

  // ---------- Bouton ----------
  if (o.cta?.url && o.cta.label) {
    blocks.push(`
      <tr><td style="${pad}padding-top:4px;padding-bottom:22px;">
        <a href="${escapeHtml(o.cta.url)}" target="_blank" style="display:inline-block;background:${C.primary};color:${C.white};text-decoration:none;font-size:14px;font-weight:bold;padding:11px 22px;border-radius:4px;">${escapeHtml(o.cta.label)}</a>
      </td></tr>`);
  }

  // ---------- Notes (fond gris clair, comme la facture) ----------
  const noteLines = (o.notes?.lines ?? []).filter((l) => !isEmpty(l));
  if (noteLines.length || o.attachmentNote) {
    blocks.push(`
      <tr><td style="${pad}padding-bottom:16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};">
          <tr><td style="padding:10px 14px;font-size:12px;line-height:1.5;color:#475569;">
            ${o.notes?.title ? `<p style="margin:0 0 4px 0;font-weight:bold;color:${C.ink};">${escapeHtml(o.notes.title)}</p>` : ''}
            ${noteLines.map((l) => `<p style="margin:0 0 3px 0;">${text(l)}</p>`).join('')}
            ${o.attachmentNote ? `<p style="margin:0;">${escapeHtml(o.attachmentNote)}</p>` : ''}
          </td></tr>
        </table>
      </td></tr>`);
  }

  const statusLine = o.badge?.text
    ? `<p style="margin:4px 0 0 0;font-size:12px;font-weight:bold;color:${TONE_TEXT[o.badge.tone ?? 'neutral']};">${escapeHtml(o.badge.text)}</p>`
    : '';

  // ---------- En-tête : expéditeur à gauche, client à droite (comme invoice.ejs) ----------
  const recLines = (o.recipient?.lines ?? []).filter(Boolean) as string[];
  const recipientHtml =
    o.recipient && (o.recipient.name || recLines.length)
      ? `${o.recipient.label ? `<span style="color:${C.muted};">${escapeHtml(o.recipient.label)}</span><br/>` : ''}
         ${o.recipient.name ? `<strong>${escapeHtml(o.recipient.name)}</strong><br/>` : ''}
         ${recLines.map((l) => escapeHtml(l)).join('<br/>')}`
      : '';

  const header = `
      <tr><td style="${pad}padding-top:24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td valign="top" align="${start}" style="font-size:11px;line-height:1.5;color:${C.ink};">
              <img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.senderName)}" width="150" style="display:block;width:150px;height:auto;border:0;margin-bottom:6px;" />
              <strong>${escapeHtml(brand.senderName)}</strong><br/>
              ${brand.senderLines.map((l) => escapeHtml(l)).join('<br/>')}
            </td>
            <td valign="top" align="${end}" style="padding-${start}:12px;font-size:11px;line-height:1.5;color:${C.ink};">
              ${recipientHtml}
            </td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="${pad}padding-top:18px;padding-bottom:18px;font-size:11px;line-height:1.6;color:${C.ink};">
        <p style="margin:0;font-size:28px;line-height:1.2;font-weight:bold;color:${C.primary};">${escapeHtml(o.title)}</p>
        ${o.reference ? `<p style="margin:6px 0 0 0;font-size:13px;font-weight:bold;color:${C.text};">${escapeHtml(o.reference)}</p>` : ''}
        ${o.date ? `<p style="margin:2px 0 0 0;">${escapeHtml(o.date)}</p>` : ''}
        ${statusLine}
      </td></tr>`;

  const footer = `
      <tr><td style="${pad}padding-top:4px;padding-bottom:4px;font-size:12px;color:${C.muted};">
        ${escapeHtml(brand.contactTitle)} ${escapeHtml(brand.contactLine)}
      </td></tr>
      <tr><td align="center" style="${pad}padding-top:14px;font-size:12px;font-style:italic;color:${C.muted};">${escapeHtml(brand.thankYou)}</td></tr>
      <tr><td style="${pad}padding-top:10px;padding-bottom:24px;">
        <div style="border-top:1px solid ${C.border};padding-top:9px;text-align:center;font-size:11px;line-height:1.4;color:${C.faint};">
          ${brand.legalLines.filter(Boolean).map((l) => escapeHtml(l)).join('<br/>')}
        </div>
      </td></tr>`;

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" dir="${dir}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(o.title)} - Favor Help</title>
</head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT};">
  ${o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(o.preheader)}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
    <tr><td align="center" style="padding:20px 10px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.white};font-family:${FONT};" dir="${dir}">
        ${header}
        ${blocks.join('')}
        ${footer}
      </table>
      <p style="margin:12px 0 0 0;font-size:11px;color:${C.faint};font-family:${FONT};">${escapeHtml(brand.autoMessage)} © ${year} ${escapeHtml(brand.senderName)}</p>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Formate un montant : 1234.5 → "1 234.50 USD" */
export function formatMoney(amount: unknown, currency?: string | null): string {
  const n = Number(amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const parts = safe.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${parts.join('.')}${currency ? ` ${currency}` : ''}`;
}

/** Formate une date selon la langue (jj/mm/aaaa en fr) */
export function formatDate(value: unknown, lang = 'fr', withTime = false): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  const locale = ({ fr: 'fr-FR', en: 'en-US', es: 'es-ES', sw: 'sw-KE', ar: 'ar' } as Record<string, string>)[lang] || 'fr-FR';
  return withTime
    ? d.toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
