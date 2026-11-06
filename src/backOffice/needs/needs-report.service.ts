import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { NeedRates, NeedsAccessService, round2 } from './common/needs-access.service';
import { buildXlsx, h, htmlToPdf } from './common/needs-export';
import { NeedLevelStatus, NeedStatus } from './common/needs.enums';
import { NeedItem, NeedLevelState, NeedLog, NeedRequest } from './entities/need.entity';
import { NeedsService } from './needs.service';
import { NeedExportQueryDto, NeedQueryDto } from './dto/needs.dto';

const STATUS_FR: Record<string, string> = {
  DRAFT: 'Brouillon',
  PENDING: 'En validation',
  CORRECTION_REQUESTED: 'Correction demandée',
  REJECTED: 'Rejeté',
  VALIDATED: 'Validé',
  CANCELLED: 'Annulé',
  NONE: '—',
  TRANSMITTED: 'Transmis finance',
  AUTHORIZED: 'Autorisé',
  PARTIALLY_PAID: 'Payé en partie',
  PAID: 'Payé',
  NOT_STARTED: 'Non commencé',
  IN_PROGRESS: 'En cours',
  PARTIAL: 'Partiel',
  COMPLETED: 'Terminé',
  NORMAL: 'Normal',
  URGENT: 'Urgent',
  VERY_URGENT: 'Très urgent',
};
const fr = (v: any) => STATUS_FR[String(v)] ?? String(v ?? '');
const money = (v: any) => (v === null || v === undefined ? '' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dt = (v: any) => (v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');

/**
 * ✅ Tableau de bord, statistiques et exports (Excel / PDF) des états de besoins.
 * Mêmes filtres que la liste : département, agent, validateur, période, priorité, statut…
 */
@Injectable()
export class NeedsReportService {
  constructor(
    private readonly access: NeedsAccessService,
    private readonly needs: NeedsService,
  ) { }

  private get m() {
    return this.access.m;
  }

  async dashboard(q: NeedQueryDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, q.companyId, lang);
    const query = { ...q, scope: q.scope || (this.access.seesAll(ctx) ? 'all' : 'mine') };
    const { sql, params } = await this.needs.whereFor(ctx, query, lang);
    const base = `FROM bo_need_requests n LEFT JOIN bo_need_rules nr ON nr.id = n.ruleId WHERE ${sql}`;
    const sla = this.needs.slaHours;

    const [counts, byCurrency, byDept, byPriority, byCategory, delays, overdue, monthly] = await Promise.all([
      this.m.query(
        `SELECT
           COUNT(*) AS total,
           SUM(n.status = 'DRAFT') AS drafts,
           SUM(n.status = 'PENDING') AS pending,
           SUM(n.status = 'CORRECTION_REQUESTED') AS corrections,
           SUM(n.status = 'VALIDATED') AS approved,
           SUM(n.status = 'REJECTED') AS rejected,
           SUM(n.status = 'CANCELLED') AS cancelled,
           SUM(n.status = 'VALIDATED' AND n.financeStatus IN ('NONE','TRANSMITTED')) AS awaitingFinance,
           SUM(n.status = 'VALIDATED' AND n.financeStatus = 'AUTHORIZED') AS authorized,
           SUM(n.status = 'VALIDATED' AND n.financeStatus = 'PARTIALLY_PAID') AS partiallyPaid,
           SUM(n.status = 'VALIDATED' AND n.financeStatus = 'PAID') AS paid,
           SUM(n.status = 'VALIDATED' AND n.executionStatus IN ('IN_PROGRESS','PARTIAL')) AS inExecution,
           SUM(n.status = 'VALIDATED' AND n.executionStatus = 'PARTIAL') AS partiallyExecuted,
           SUM(n.status = 'VALIDATED' AND n.executionStatus = 'COMPLETED') AS executed
         ${base}`,
        params,
      ),
      this.m.query(
        `SELECT n.currency,
                SUM(CASE WHEN n.status <> 'DRAFT' AND n.status <> 'CANCELLED' THEN n.estimatedTotal ELSE 0 END) AS requested,
                SUM(CASE WHEN n.status = 'VALIDATED' THEN COALESCE(n.approvedAmount, n.estimatedTotal) ELSE 0 END) AS approved,
                SUM(CASE WHEN n.status = 'VALIDATED' THEN COALESCE(n.authorizedAmount, 0) ELSE 0 END) AS authorized,
                SUM(n.disbursedTotal) AS disbursed
           ${base} GROUP BY n.currency`,
        params,
      ),
      this.m.query(
        `SELECT n.departmentId AS id, COALESCE(n.departmentName, '—') AS name, COUNT(*) AS count,
                SUM(n.status = 'PENDING') AS pending, SUM(n.status = 'VALIDATED') AS approved,
                SUM(COALESCE(n.estimatedTotalUsd, 0)) AS requestedUsd, SUM(n.disbursedTotal) AS disbursed
           ${base} GROUP BY n.departmentId, n.departmentName ORDER BY count DESC LIMIT 50`,
        params,
      ),
      this.m.query(`SELECT n.priority AS priority, COUNT(*) AS count, SUM(n.status = 'PENDING') AS pending ${base} GROUP BY n.priority`, params),
      this.m.query(`SELECT n.category AS category, COUNT(*) AS count, SUM(COALESCE(n.estimatedTotalUsd, 0)) AS requestedUsd ${base} GROUP BY n.category ORDER BY count DESC`, params),
      this.m.query(
        `SELECT AVG(TIMESTAMPDIFF(MINUTE, COALESCE(n.firstSubmittedAt, n.submittedAt), n.validatedAt)) AS avgMinutes,
                MIN(TIMESTAMPDIFF(MINUTE, COALESCE(n.firstSubmittedAt, n.submittedAt), n.validatedAt)) AS minMinutes,
                MAX(TIMESTAMPDIFF(MINUTE, COALESCE(n.firstSubmittedAt, n.submittedAt), n.validatedAt)) AS maxMinutes,
                AVG(CASE WHEN n.authorizedAt IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, n.validatedAt, n.authorizedAt) END) AS avgToAuthorizeMinutes
           ${base} AND n.status = 'VALIDATED' AND n.validatedAt IS NOT NULL`,
        params,
      ),
      this.m.query(`SELECT COUNT(*) AS c ${base} AND n.status = 'PENDING' AND n.levelStartedAt < DATE_SUB(NOW(), INTERVAL COALESCE(nr.slaHours, ?) HOUR)`, [...params, sla]),
      this.m.query(
        `SELECT DATE_FORMAT(COALESCE(n.submittedAt, n.createdAt), '%Y-%m') AS month, COUNT(*) AS count,
                SUM(n.status = 'VALIDATED') AS approved, SUM(n.status = 'REJECTED') AS rejected,
                SUM(COALESCE(n.estimatedTotalUsd, 0)) AS requestedUsd
           ${base} GROUP BY month ORDER BY month DESC LIMIT 12`,
        params,
      ),
    ]);

    // Délai moyen par niveau et par validateur (d'après le circuit enregistré)
    const validatedRows: { levels: any }[] = await this.m.query(`SELECT n.levels ${base} AND n.levels IS NOT NULL AND n.status <> 'DRAFT' LIMIT 2000`, params);
    const perLevel = new Map<string, { name: string; total: number; count: number }>();
    const perValidator = new Map<string, { total: number; count: number; approved: number; rejected: number; returned: number }>();
    for (const r of validatedRows) {
      const levels: NeedLevelState[] = typeof r.levels === 'string' ? JSON.parse(r.levels) : r.levels;
      for (const l of levels ?? []) {
        if (!l.startedAt || !l.completedAt || l.status === NeedLevelStatus.SKIPPED) continue;
        const min = (new Date(l.completedAt).getTime() - new Date(l.startedAt).getTime()) / 60000;
        const k = `${l.level}`;
        const e = perLevel.get(k) ?? { name: l.name, total: 0, count: 0 };
        e.total += min;
        e.count += 1;
        perLevel.set(k, e);
        if (l.decidedById) {
          const v = perValidator.get(l.decidedById) ?? { total: 0, count: 0, approved: 0, rejected: 0, returned: 0 };
          v.total += min;
          v.count += 1;
          if (l.status === NeedLevelStatus.APPROVED) v.approved += 1;
          if (l.status === NeedLevelStatus.REJECTED) v.rejected += 1;
          if (l.status === NeedLevelStatus.RETURNED) v.returned += 1;
          perValidator.set(l.decidedById, v);
        }
      }
    }
    const people = await this.access.people([...perValidator.keys()]);

    // Totaux en USD (taux exchange_rates)
    const rates = new NeedRates(this.m);
    const usd = { requested: 0, approved: 0, authorized: 0, disbursed: 0 };
    const missing: string[] = [];
    for (const c of byCurrency) {
      for (const k of Object.keys(usd) as (keyof typeof usd)[]) {
        const v = await rates.convert(Number(c[k] || 0), c.currency, 'USD');
        if (v === null) {
          if (!missing.includes(c.currency)) missing.push(c.currency);
        } else usd[k] = round2(usd[k] + v);
      }
    }
    const c = counts[0] || {};
    const num = (v: any) => Number(v || 0);
    const hours = (v: any) => (v === null || v === undefined ? null : Math.round((Number(v) / 60) * 10) / 10);

    return {
      message: this.access.t('needs.dashboard', lang),
      data: {
        filters: query,
        counts: {
          total: num(c.total),
          drafts: num(c.drafts),
          pending: num(c.pending),
          corrections: num(c.corrections),
          approved: num(c.approved),
          rejected: num(c.rejected),
          cancelled: num(c.cancelled),
          awaitingFinance: num(c.awaitingFinance),
          authorized: num(c.authorized),
          partiallyPaid: num(c.partiallyPaid),
          paid: num(c.paid),
          inExecution: num(c.inExecution),
          partiallyExecuted: num(c.partiallyExecuted),
          executed: num(c.executed),
          overdue: num(overdue[0]?.c),
        },
        amounts: {
          byCurrency: byCurrency.map((r: any) => ({
            currency: r.currency,
            requested: round2(num(r.requested)),
            approved: round2(num(r.approved)),
            authorized: round2(num(r.authorized)),
            disbursed: round2(num(r.disbursed)),
          })),
          usd,
          missingRates: missing,
        },
        delays: {
          avgValidationHours: hours(delays[0]?.avgMinutes),
          minValidationHours: hours(delays[0]?.minMinutes),
          maxValidationHours: hours(delays[0]?.maxMinutes),
          avgAuthorizationHours: hours(delays[0]?.avgToAuthorizeMinutes),
          slaHours: sla,
          byLevel: [...perLevel.entries()]
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([level, e]) => ({ level: Number(level), name: e.name, decisions: e.count, avgHours: Math.round((e.total / e.count / 60) * 10) / 10 })),
          byValidator: [...perValidator.entries()]
            .map(([id, v]) => ({ validator: people.get(id) ?? { id }, decisions: v.count, approved: v.approved, rejected: v.rejected, returned: v.returned, avgHours: Math.round((v.total / v.count / 60) * 10) / 10 }))
            .sort((a, b) => b.decisions - a.decisions)
            .slice(0, 30),
        },
        byDepartment: byDept.map((r: any) => ({ id: r.id, name: r.name, count: num(r.count), pending: num(r.pending), approved: num(r.approved), requestedUsd: round2(num(r.requestedUsd)) })),
        byPriority: byPriority.map((r: any) => ({ priority: r.priority, count: num(r.count), pending: num(r.pending) })),
        byCategory: byCategory.map((r: any) => ({ category: r.category, count: num(r.count), requestedUsd: round2(num(r.requestedUsd)) })),
        monthly: monthly.reverse().map((r: any) => ({ month: r.month, count: num(r.count), approved: num(r.approved), rejected: num(r.rejected), requestedUsd: round2(num(r.requestedUsd)) })),
      },
    };
  }

  // ============================================================
  // EXPORTS
  // ============================================================

  private async rowsFor(q: NeedQueryDto, user: UserEntity, lang: string) {
    const ctx = await this.access.context(user, q.companyId, lang);
    const { sql, params } = await this.needs.whereFor(ctx, { ...q, scope: q.scope || (this.access.seesAll(ctx) ? 'all' : 'mine') }, lang);
    const ids: { id: string }[] = await this.m.query(
      `SELECT n.id FROM bo_need_requests n LEFT JOIN bo_need_rules nr ON nr.id = n.ruleId WHERE ${sql} ORDER BY n.createdAt DESC LIMIT 5000`,
      params,
    );
    const list = ids.length ? await this.m.find(NeedRequest, { where: { id: In(ids.map((r) => r.id)) }, order: { createdAt: 'DESC' } }) : [];
    const company: any[] = await this.m.query('SELECT companyName FROM company WHERE id = ? LIMIT 1', [ctx.companyId]);
    return { list, companyName: company[0]?.companyName ?? '' };
  }

  async exportList(q: NeedExportQueryDto, user: UserEntity, lang: string): Promise<{ filename: string; contentType: string; content: Buffer }> {
    const { list, companyName } = await this.rowsFor(q, user, lang);
    const items = list.length ? await this.m.find(NeedItem, { where: { needId: In(list.map((n) => n.id)) }, order: { position: 'ASC' } }) : [];
    const stamp = new Date().toISOString().slice(0, 10);
    const current = (n: NeedRequest) => (n.levels ?? []).find((l) => l.level === n.currentLevel)?.name ?? '';

    if (q.format === 'pdf') {
      const totals = new Map<string, { req: number; app: number; paid: number }>();
      for (const n of list) {
        const t = totals.get(n.currency) ?? { req: 0, app: 0, paid: 0 };
        if (n.status !== NeedStatus.DRAFT && n.status !== NeedStatus.CANCELLED) t.req += Number(n.estimatedTotal);
        if (n.status === NeedStatus.VALIDATED) t.app += Number(n.approvedAmount ?? n.estimatedTotal);
        t.paid += Number(n.disbursedTotal);
        totals.set(n.currency, t);
      }
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#1f2933}
        h1{font-size:16px;margin:0 0 2px}.muted{color:#6b7280}
        table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #d9dee5;padding:4px 5px;text-align:left;vertical-align:top}
        th{background:#eef2f7}.r{text-align:right}.tot td{font-weight:bold;background:#f7f9fb}
      </style></head><body>
        <h1>États de besoins — ${h(companyName)}</h1>
        <div class="muted">Édité le ${h(dt(new Date()))} · ${list.length} demande(s)${q.from || q.to ? ` · période ${h(q.from ?? '…')} → ${h(q.to ?? '…')}` : ''}</div>
        <table><thead><tr><th>Référence</th><th>Date</th><th>Demandeur</th><th>Département</th><th>Titre</th><th>Priorité</th><th>Statut</th><th>Niveau en cours</th><th>Finance</th><th>Exécution</th><th class="r">Demandé</th><th class="r">Approuvé</th><th class="r">Décaissé</th></tr></thead><tbody>
        ${list
          .map(
            (n) => `<tr><td>${h(n.reference)}</td><td>${h(dt(n.submittedAt ?? n.createdAt))}</td><td>${h(n.requesterName)}</td><td>${h(n.departmentName ?? '')}</td><td>${h(n.title)}</td>
            <td>${h(fr(n.priority))}</td><td>${h(fr(n.status))}</td><td>${h(current(n))}</td><td>${h(fr(n.financeStatus))}</td><td>${h(fr(n.executionStatus))}</td>
            <td class="r">${money(n.estimatedTotal)} ${h(n.currency)}</td><td class="r">${n.status === NeedStatus.VALIDATED ? `${money(n.approvedAmount ?? n.estimatedTotal)} ${h(n.currency)}` : ''}</td><td class="r">${money(n.disbursedTotal)} ${h(n.currency)}</td></tr>`,
          )
          .join('')}
        ${[...totals.entries()].map(([cur, t]) => `<tr class="tot"><td colspan="10">Total ${h(cur)}</td><td class="r">${money(t.req)}</td><td class="r">${money(t.app)}</td><td class="r">${money(t.paid)}</td></tr>`).join('')}
        </tbody></table></body></html>`;
      return { filename: `etats-de-besoins_${stamp}.pdf`, contentType: 'application/pdf', content: await htmlToPdf(html, true) };
    }

    const content = await buildXlsx([
      {
        name: 'États de besoins',
        columns: [
          { header: 'Référence', width: 22 },
          { header: 'Date de soumission', width: 18 },
          { header: 'Demandeur', width: 24 },
          { header: 'Département', width: 22 },
          { header: 'Titre', width: 34 },
          { header: 'Catégorie', width: 14 },
          { header: 'Priorité', width: 12 },
          { header: 'Statut', width: 18 },
          { header: 'Niveau en cours', width: 22 },
          { header: 'Devise', width: 8 },
          { header: 'Montant demandé', width: 16 },
          { header: 'Montant approuvé', width: 16 },
          { header: 'Montant autorisé', width: 16 },
          { header: 'Montant décaissé', width: 16 },
          { header: 'Finance', width: 16 },
          { header: 'Exécution', width: 14 },
          { header: 'Exécution (%)', width: 12 },
          { header: 'Validé le', width: 18 },
          { header: 'Motif de rejet', width: 30 },
        ],
        rows: list.map((n) => [
          n.reference,
          dt(n.submittedAt ?? n.createdAt),
          n.requesterName,
          n.departmentName,
          n.title,
          n.category,
          fr(n.priority),
          fr(n.status),
          current(n),
          n.currency,
          Number(n.estimatedTotal),
          n.status === NeedStatus.VALIDATED ? Number(n.approvedAmount ?? n.estimatedTotal) : null,
          n.authorizedAmount ?? null,
          Number(n.disbursedTotal),
          fr(n.financeStatus),
          fr(n.executionStatus),
          n.executionRate,
          dt(n.validatedAt),
          n.rejectionReason ?? '',
        ]),
      },
      {
        name: 'Articles',
        columns: [
          { header: 'Référence', width: 22 },
          { header: 'Désignation', width: 34 },
          { header: 'Unité', width: 10 },
          { header: 'Quantité', width: 10 },
          { header: 'Prix unitaire', width: 14 },
          { header: 'Total', width: 14 },
          { header: 'Devise', width: 8 },
          { header: 'Quantité exécutée', width: 14 },
        ],
        rows: items.map((i) => {
          const n = list.find((x) => x.id === i.needId)!;
          return [n?.reference, i.designation, i.unit, Number(i.quantity), Number(i.unitPrice), Number(i.total), n?.currency, Number(i.executedQuantity)];
        }),
      },
    ]);
    return { filename: `etats-de-besoins_${stamp}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content };
  }

  /** ✅ Fiche PDF d'un état de besoin : articles, circuit et signatures, finance, historique */
  async exportOne(id: string, user: UserEntity, lang: string): Promise<{ filename: string; content: Buffer }> {
    const d: any = await this.needs.detail(id, user, lang);
    const company: any[] = await this.m.query('SELECT companyName FROM company WHERE id = ? LIMIT 1', [d.companyId]);
    const logs: NeedLog[] = d.history ?? [];
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1f2933}
      h1{font-size:18px;margin:0}h2{font-size:13px;margin:16px 0 6px;border-bottom:1px solid #d9dee5;padding-bottom:3px}
      .muted{color:#6b7280}.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;margin-top:8px}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #d9dee5;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef2f7}.r{text-align:right}
      .badge{display:inline-block;padding:1px 6px;border:1px solid #9aa5b1;border-radius:8px;font-size:10px}
    </style></head><body>
      <div class="muted">${h(company[0]?.companyName ?? '')}</div>
      <h1>État de besoin ${h(d.reference)}</h1>
      <div><span class="badge">${h(fr(d.status))}</span> <span class="badge">${h(fr(d.priority))}</span> <span class="badge">Finance : ${h(fr(d.financeStatus))}</span> <span class="badge">Exécution : ${h(fr(d.executionStatus))} (${d.executionRate}%)</span></div>
      <div class="grid">
        <div><b>Demandeur :</b> ${h(d.requester?.fullName ?? d.requesterName)}</div><div><b>Département :</b> ${h(d.departmentName ?? '—')}</div>
        <div><b>Catégorie :</b> ${h(d.category)}</div><div><b>Soumis le :</b> ${h(dt(d.submittedAt))}</div>
        <div><b>Date souhaitée :</b> ${h(d.neededBy ?? '—')}</div><div><b>Validé le :</b> ${h(dt(d.validatedAt))}</div>
      </div>
      <h2>${h(d.title)}</h2><div>${h(d.description ?? '')}</div>
      <p><b>Motif / justification :</b> ${h(d.justification ?? '')}</p>
      <h2>Articles / services</h2>
      <table><thead><tr><th>#</th><th>Désignation</th><th>Unité</th><th class="r">Qté</th><th class="r">Prix unitaire</th><th class="r">Total</th><th class="r">Exécuté</th></tr></thead><tbody>
      ${(d.items ?? []).map((i: any, k: number) => `<tr><td>${k + 1}</td><td>${h(i.designation)}${i.description ? `<div class="muted">${h(i.description)}</div>` : ''}</td><td>${h(i.unit ?? '')}</td><td class="r">${money(i.quantity)}</td><td class="r">${money(i.unitPrice)}</td><td class="r">${money(i.total)}</td><td class="r">${money(i.executedQuantity)}</td></tr>`).join('')}
      <tr><td colspan="5"><b>Montant estimé</b></td><td class="r"><b>${money(d.estimatedTotal)} ${h(d.currency)}</b></td><td></td></tr>
      ${d.approvedAmount != null ? `<tr><td colspan="5"><b>Montant approuvé</b></td><td class="r"><b>${money(d.approvedAmount)} ${h(d.currency)}</b></td><td></td></tr>` : ''}
      </tbody></table>
      <h2>Circuit de validation${d.ruleName ? ` — ${h(d.ruleName)}` : ''}</h2>
      <table><thead><tr><th>Niveau</th><th>Validateurs</th><th>Décision</th><th>Par</th><th>Date</th><th>Observation</th></tr></thead><tbody>
      ${(d.levels ?? []).map((l: any) => `<tr><td>${l.level}. ${h(l.name)}</td><td>${h(l.approvers.map((p: any) => p?.fullName).filter(Boolean).join(', '))}</td><td>${h(l.status)}</td><td>${h(l.decidedBy?.fullName ?? '')}</td><td>${h(dt(l.completedAt))}</td><td>${h(l.comment ?? '')}</td></tr>`).join('')}
      </tbody></table>
      ${d.rejectionReason ? `<p><b>Motif du rejet :</b> ${h(d.rejectionReason)}</p>` : ''}
      <h2>Finance</h2>
      <div class="grid"><div><b>Montant autorisé :</b> ${d.authorizedAmount != null ? `${money(d.authorizedAmount)} ${h(d.currency)}` : '—'}</div><div><b>Autorisé par :</b> ${h(d.authorizedBy?.fullName ?? '—')} ${h(dt(d.authorizedAt))}</div>
      <div><b>Total décaissé :</b> ${money(d.disbursedTotal)} ${h(d.currency)}</div><div><b>Reste à décaisser :</b> ${d.remainingToDisburse != null ? `${money(d.remainingToDisburse)} ${h(d.currency)}` : '—'}</div></div>
      ${(d.disbursements ?? []).length ? `<table style="margin-top:6px"><thead><tr><th>Date</th><th class="r">Montant</th><th>Payé par</th><th>Bénéficiaire</th><th>Mode</th><th>Référence</th></tr></thead><tbody>
      ${d.disbursements.map((x: any) => `<tr><td>${h(x.paidAt)}</td><td class="r">${money(x.amount)} ${h(x.currency)}</td><td>${h(x.paidBy?.fullName ?? x.paidByName ?? '')}</td><td>${h(x.beneficiary ?? '')}</td><td>${h(x.paymentMethod ?? '')}</td><td>${h(x.paymentReference ?? '')}</td></tr>`).join('')}
      </tbody></table>` : ''}
      <h2>Historique</h2>
      <table><thead><tr><th>Date</th><th>Action</th><th>Niveau</th><th>Par</th><th>Observation</th></tr></thead><tbody>
      ${logs.filter((l: any) => !['NOTIFIED', 'CALLED'].includes(l.action)).map((l: any) => `<tr><td>${h(dt(l.createdAt))}</td><td>${h(l.action)}</td><td>${l.level || ''}</td><td>${h(l.user?.fullName ?? l.userName ?? 'Système')}</td><td>${h(l.comment ?? '')}</td></tr>`).join('')}
      </tbody></table>
    </body></html>`;
    return { filename: `${d.reference}.pdf`, content: await htmlToPdf(html) };
  }
}
