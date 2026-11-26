// src/backOffice/commercial/prospects/prospect-performance.service.ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { paginated, pageParams } from 'src/common/pagination/paginate.util';
import { ProspectActivitiesQueryDto, ProspectAssignmentsQueryDto, ProspectPerformanceQueryDto } from './dto/prospect-tracking.dto';

type Where = { sql: string; params: any[] };

const PERIOD_FORMAT: Record<string, string> = {
    day: '%Y-%m-%d',
    week: '%x-S%v',
    month: '%Y-%m',
    year: '%Y',
};

const n = (v: any) => Number(v) || 0;
const pct = (a: number, b: number) => (b ? Math.round((a * 1000) / b) / 10 : 0);

/**
 * ✅ TABLEAU DE BORD DES AGENTS (administrateurs et super administrateurs)
 *  Par agent : prospects enregistrés, assignés (dont il est responsable), traités, en attente, convertis,
 *  rejetés / non intéressés, taux de conversion, assignations faites à d'autres et reçues, activité.
 *  Répartition par pays, ville, source, statut ; évolution par jour / semaine / mois / année.
 */
@Injectable()
export class ProspectPerformanceService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly i18n: I18nService,
    ) { }

    private async t(key: string, lang: string, params?: any): Promise<string> {
        try {
            return await this.i18n.translate(key, lang, params);
        } catch {
            return key;
        }
    }

    private dateRange(q: { startDate?: string; endDate?: string }) {
        const start = q.startDate ? new Date(q.startDate) : null;
        const end = q.endDate ? new Date(q.endDate) : null;
        if (start && isNaN(start.getTime())) return { start: null, end: null };
        if (end) {
            if (isNaN(end.getTime())) return { start, end: null };
            if (/^\d{4}-\d{2}-\d{2}$/.test(String(q.endDate))) end.setHours(23, 59, 59, 999);
        }
        return { start, end };
    }

    /** Filtres sur les prospects (alias p) ; dateCol = colonne filtrée par la période */
    private where(q: ProspectPerformanceQueryDto, dateCol: string | null = 'p.createdAt', withAgent = true): Where {
        const parts: string[] = ['1 = 1'];
        const params: any[] = [];
        const { start, end } = this.dateRange(q);
        if (dateCol && start) {
            parts.push(`${dateCol} >= ?`);
            params.push(start);
        }
        if (dateCol && end) {
            parts.push(`${dateCol} <= ?`);
            params.push(end);
        }
        if (q.countryId) {
            parts.push('p.countryId = ?');
            params.push(q.countryId);
        }
        if (q.cityId) {
            parts.push('p.cityId = ?');
            params.push(q.cityId);
        }
        if (q.status) {
            parts.push('p.status = ?');
            params.push(q.status);
        }
        if (q.source) {
            parts.push('(p.source = ? OR p.socialNetwork = ?)');
            params.push(q.source, q.source);
        }
        if (q.companyId) {
            parts.push('p.companyId = ?');
            params.push(q.companyId);
        }
        if (withAgent && q.agentId) {
            parts.push('(p.createdById = ? OR p.assignedToId = ?)');
            params.push(q.agentId, q.agentId);
        }
        return { sql: parts.join(' AND '), params };
    }

    private q(sql: string, params: any[]): Promise<any[]> {
        return this.dataSource.query(sql, params).catch(() => []);
    }

    // ============================================================
    // TABLEAU DE BORD
    // ============================================================
    async performance(q: ProspectPerformanceQueryDto, lang = 'fr') {
        const w = this.where(q);
        const wNoAgent = this.where(q, 'p.createdAt', false);
        const { start, end } = this.dateRange(q);

        // ---------- Totaux ----------
        const [totalsRow] = await this.q(
            `SELECT COUNT(*) AS total,
                    SUM(p.status = 'NEW') AS pending,
                    SUM(p.status <> 'NEW') AS processed,
                    SUM(p.status = 'WON') AS converted,
                    SUM(p.status = 'LOST') AS lost,
                    SUM(p.status NOT IN ('NEW', 'WON', 'LOST')) AS inProgress,
                    SUM(p.assignedToId IS NOT NULL) AS assigned,
                    SUM(p.assignedToId IS NULL) AS unassigned,
                    SUM(p.linkedUserId IS NOT NULL) AS withAccount
             FROM prospects p WHERE ${w.sql}`,
            w.params,
        );

        // ---------- Par agent ----------
        const registeredRows = await this.q(
            `SELECT p.createdById AS agentId, COUNT(*) AS registered,
                    SUM(p.status = 'WON') AS registeredConverted, SUM(p.status = 'LOST') AS registeredLost
             FROM prospects p WHERE ${wNoAgent.sql} AND p.createdById IS NOT NULL GROUP BY p.createdById`,
            wNoAgent.params,
        );
        const responsibleRows = await this.q(
            `SELECT p.assignedToId AS agentId, COUNT(*) AS assigned,
                    SUM(p.status = 'NEW') AS pending,
                    SUM(p.status <> 'NEW') AS processed,
                    SUM(p.status = 'WON') AS converted,
                    SUM(p.status = 'LOST') AS lost,
                    SUM(p.status NOT IN ('NEW', 'WON', 'LOST')) AS inProgress,
                    AVG(CASE WHEN p.processedAt IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, p.createdAt, p.processedAt) END) AS avgMinutesToProcess,
                    AVG(CASE WHEN p.convertedAt IS NOT NULL THEN TIMESTAMPDIFF(HOUR, p.createdAt, p.convertedAt) END) AS avgHoursToConvert
             FROM prospects p WHERE ${wNoAgent.sql} AND p.assignedToId IS NOT NULL GROUP BY p.assignedToId`,
            wNoAgent.params,
        );

        // Assignations (période sur la date de l'assignation)
        const aParts: string[] = ['1 = 1'];
        const aParams: any[] = [];
        if (start) {
            aParts.push('a.createdAt >= ?');
            aParams.push(start);
        }
        if (end) {
            aParts.push('a.createdAt <= ?');
            aParams.push(end);
        }
        const aWhere = aParts.join(' AND ');
        const madeRows = await this.q(
            `SELECT a.assignedById AS agentId, COUNT(*) AS transfersMade, COUNT(DISTINCT a.prospectId) AS prospectsTransferred,
                    COUNT(DISTINCT a.toUserId) AS distinctRecipients
             FROM prospect_assignments a
             WHERE ${aWhere} AND a.assignedById IS NOT NULL AND (a.toUserId IS NULL OR a.toUserId <> a.assignedById)
             GROUP BY a.assignedById`,
            aParams,
        );
        const receivedRows = await this.q(
            `SELECT a.toUserId AS agentId, COUNT(*) AS transfersReceived
             FROM prospect_assignments a
             WHERE ${aWhere} AND a.toUserId IS NOT NULL AND (a.assignedById IS NULL OR a.assignedById <> a.toUserId)
             GROUP BY a.toUserId`,
            aParams,
        );
        const hParts = aParts.map((x) => x.replace(/a\.createdAt/g, 'h.createdAt'));
        const activityRows = await this.q(
            `SELECT h.userId AS agentId, COUNT(*) AS actions, MAX(h.createdAt) AS lastActivityAt
             FROM prospect_history h WHERE ${hParts.join(' AND ')} AND h.userId IS NOT NULL GROUP BY h.userId`,
            aParams,
        );

        const agents = new Map<string, any>();
        const get = (id: string) => {
            if (!agents.has(id)) {
                agents.set(id, {
                    agentId: id,
                    registered: 0, registeredConverted: 0, registeredLost: 0,
                    assigned: 0, pending: 0, processed: 0, inProgress: 0, converted: 0, lost: 0,
                    transfersMade: 0, prospectsTransferred: 0, distinctRecipients: 0, transfersReceived: 0,
                    actions: 0, lastActivityAt: null, avgMinutesToProcess: null, avgHoursToConvert: null,
                });
            }
            return agents.get(id);
        };
        for (const r of registeredRows) Object.assign(get(r.agentId), { registered: n(r.registered), registeredConverted: n(r.registeredConverted), registeredLost: n(r.registeredLost) });
        for (const r of responsibleRows) {
            Object.assign(get(r.agentId), {
                assigned: n(r.assigned), pending: n(r.pending), processed: n(r.processed), inProgress: n(r.inProgress),
                converted: n(r.converted), lost: n(r.lost),
                avgMinutesToProcess: r.avgMinutesToProcess != null ? Math.round(Number(r.avgMinutesToProcess)) : null,
                avgHoursToConvert: r.avgHoursToConvert != null ? Math.round(Number(r.avgHoursToConvert)) : null,
            });
        }
        for (const r of madeRows) Object.assign(get(r.agentId), { transfersMade: n(r.transfersMade), prospectsTransferred: n(r.prospectsTransferred), distinctRecipients: n(r.distinctRecipients) });
        for (const r of receivedRows) Object.assign(get(r.agentId), { transfersReceived: n(r.transfersReceived) });
        for (const r of activityRows) Object.assign(get(r.agentId), { actions: n(r.actions), lastActivityAt: r.lastActivityAt });

        const ids = [...agents.keys()].filter((id) => !q.agentId || id === q.agentId);
        const users: any[] = ids.length
            ? await this.q('SELECT id, fullName, email, phone, image, role, isActive FROM users WHERE id IN (?)', [ids])
            : [];
        const userBy = new Map(users.map((u) => [u.id, u]));
        const list = ids
            .map((id) => {
                const a = agents.get(id);
                const u = userBy.get(id);
                return {
                    agent: u ? { id: u.id, fullName: u.fullName, email: u.email, phone: u.phone, image: u.image, role: u.role, isActive: !!u.isActive } : { id, fullName: null },
                    ...a,
                    conversionRate: pct(a.converted, a.assigned),
                    processingRate: pct(a.processed, a.assigned),
                    lossRate: pct(a.lost, a.assigned),
                    registeredConversionRate: pct(a.registeredConverted, a.registered),
                };
            })
            .sort((x, y) => y.converted - x.converted || y.conversionRate - x.conversionRate || y.processed - x.processed || y.registered - x.registered)
            .map((x, i) => ({ rank: i + 1, ...x }));

        const top = q.top ?? 10;
        const eligible = list.filter((x) => x.assigned >= 5);

        // ---------- Répartitions ----------
        const byCountry = await this.q(
            `SELECT p.countryId AS id, COALESCE(p.countryName, 'Non renseigné') AS name, COUNT(*) AS total, SUM(p.status = 'WON') AS converted
             FROM prospects p WHERE ${w.sql} GROUP BY p.countryId, p.countryName ORDER BY total DESC LIMIT 50`,
            w.params,
        );
        const byCity = await this.q(
            `SELECT p.cityId AS id, COALESCE(p.cityName, 'Non renseignée') AS name, p.countryName AS country, COUNT(*) AS total, SUM(p.status = 'WON') AS converted
             FROM prospects p WHERE ${w.sql} GROUP BY p.cityId, p.cityName, p.countryName ORDER BY total DESC LIMIT 100`,
            w.params,
        );
        const bySource = await this.q(
            `SELECT COALESCE(p.source, 'Non renseignée') AS source, p.socialNetwork AS socialNetwork, COUNT(*) AS total, SUM(p.status = 'WON') AS converted
             FROM prospects p WHERE ${w.sql} GROUP BY p.source, p.socialNetwork ORDER BY total DESC LIMIT 100`,
            w.params,
        );
        const byStatus = await this.q(
            `SELECT p.status AS status, COUNT(*) AS total FROM prospects p WHERE ${w.sql} GROUP BY p.status ORDER BY total DESC`,
            w.params,
        );
        const withRate = (rows: any[]) => rows.map((r) => ({ ...r, total: n(r.total), converted: n(r.converted), conversionRate: pct(n(r.converted), n(r.total)) }));

        // ---------- Évolution ----------
        const period = q.period ?? 'month';
        const fmt = PERIOD_FORMAT[period];
        const wConv = this.where(q, 'p.convertedAt');
        const wLost = this.where(q, 'p.lostAt');
        const wProc = this.where(q, 'p.processedAt');
        const [created, converted, lost, processed] = await Promise.all([
            this.q(`SELECT DATE_FORMAT(p.createdAt, '${fmt}') AS k, COUNT(*) AS c FROM prospects p WHERE ${w.sql} GROUP BY k ORDER BY k`, w.params),
            this.q(`SELECT DATE_FORMAT(p.convertedAt, '${fmt}') AS k, COUNT(*) AS c FROM prospects p WHERE ${wConv.sql} AND p.convertedAt IS NOT NULL GROUP BY k ORDER BY k`, wConv.params),
            this.q(`SELECT DATE_FORMAT(p.lostAt, '${fmt}') AS k, COUNT(*) AS c FROM prospects p WHERE ${wLost.sql} AND p.lostAt IS NOT NULL GROUP BY k ORDER BY k`, wLost.params),
            this.q(`SELECT DATE_FORMAT(p.processedAt, '${fmt}') AS k, COUNT(*) AS c FROM prospects p WHERE ${wProc.sql} AND p.processedAt IS NOT NULL GROUP BY k ORDER BY k`, wProc.params),
        ]);
        const keys = new Set<string>([...created, ...converted, ...lost, ...processed].map((r) => r.k).filter(Boolean));
        const toMap = (rows: any[]) => new Map(rows.map((r) => [r.k, n(r.c)]));
        const mc = toMap(created), mv = toMap(converted), ml = toMap(lost), mp = toMap(processed);
        const timeline = [...keys].sort().map((k) => ({
            period: k,
            created: mc.get(k) ?? 0,
            processed: mp.get(k) ?? 0,
            converted: mv.get(k) ?? 0,
            lost: ml.get(k) ?? 0,
            conversionRate: pct(mv.get(k) ?? 0, mc.get(k) ?? 0),
        }));

        const totals = {
            total: n(totalsRow?.total),
            pending: n(totalsRow?.pending),
            processed: n(totalsRow?.processed),
            inProgress: n(totalsRow?.inProgress),
            converted: n(totalsRow?.converted),
            lost: n(totalsRow?.lost),
            assigned: n(totalsRow?.assigned),
            unassigned: n(totalsRow?.unassigned),
            withAccount: n(totalsRow?.withAccount),
            conversionRate: pct(n(totalsRow?.converted), n(totalsRow?.total)),
            agents: list.length,
            transfers: madeRows.reduce((s, r) => s + n(r.transfersMade), 0),
        };

        return {
            message: await this.t('prospect.performance_retrieved', lang),
            data: {
                filters: { ...q, period },
                totals,
                agents: list,
                topPerformers: {
                    byConversions: list.slice(0, top),
                    byConversionRate: [...eligible].sort((a, b) => b.conversionRate - a.conversionRate).slice(0, top),
                    byRegistrations: [...list].sort((a, b) => b.registered - a.registered).slice(0, top),
                    byActivity: [...list].sort((a, b) => b.actions - a.actions).slice(0, top),
                },
                breakdown: {
                    byCountry: withRate(byCountry),
                    byCity: withRate(byCity),
                    bySource: withRate(bySource),
                    byStatus: byStatus.map((r) => ({ status: r.status, total: n(r.total), percent: pct(n(r.total), totals.total) })),
                },
                timeline,
            },
        };
    }

    // ============================================================
    // ASSIGNATIONS / TRANSFERTS
    // ============================================================
    async assignments(q: ProspectAssignmentsQueryDto, lang = 'fr') {
        const { page, limit, skip } = pageParams(q, 30, 200);
        const parts: string[] = ['1 = 1'];
        const params: any[] = [];
        const add = (sql: string, v: any) => {
            parts.push(sql);
            params.push(v);
        };
        if (q.assignedById) add('a.assignedById = ?', q.assignedById);
        if (q.toUserId) add('a.toUserId = ?', q.toUserId);
        if (q.fromUserId) add('a.fromUserId = ?', q.fromUserId);
        if (q.prospectId) add('a.prospectId = ?', q.prospectId);
        if (q.type) add('a.type = ?', q.type);
        if (q.status) add('p.status = ?', q.status);
        const { start, end } = this.dateRange(q);
        if (start) add('a.createdAt >= ?', start);
        if (end) add('a.createdAt <= ?', end);
        const where = parts.join(' AND ');

        const [countRow] = await this.q(`SELECT COUNT(*) AS c FROM prospect_assignments a LEFT JOIN prospects p ON p.id = a.prospectId WHERE ${where}`, params);
        const rows = await this.q(
            `SELECT a.*, p.status AS currentStatus, p.fullName AS currentProspectName, p.phone AS prospectPhone,
                    p.assignedToId AS currentResponsibleId, cr.fullName AS currentResponsibleName, (p.id IS NULL) AS prospectDeleted
             FROM prospect_assignments a
             LEFT JOIN prospects p ON p.id = a.prospectId
             LEFT JOIN users cr ON cr.id = p.assignedToId
             WHERE ${where}
             ORDER BY a.createdAt DESC
             LIMIT ${limit} OFFSET ${skip}`,
            params,
        );
        const data = rows.map((r) => ({
            id: r.id,
            type: r.type,
            createdAt: r.createdAt,
            note: r.note ?? null,
            statusAtAssignment: r.statusAtAssignment ?? null,
            prospect: {
                id: r.prospectId,
                fullName: r.currentProspectName ?? r.prospectName,
                phone: r.prospectPhone ?? null,
                currentStatus: r.currentStatus ?? null,
                deleted: !!Number(r.prospectDeleted),
            },
            assignedBy: r.assignedById ? { id: r.assignedById, fullName: r.assignedByName } : null,
            from: r.fromUserId ? { id: r.fromUserId, fullName: r.fromUserName } : null,
            to: r.toUserId ? { id: r.toUserId, fullName: r.toUserName } : null,
            currentResponsible: r.currentResponsibleId ? { id: r.currentResponsibleId, fullName: r.currentResponsibleName } : null,
        }));

        // Résumé : à qui l'agent a assigné ses prospects
        let recipients: any[] = [];
        if (q.assignedById) {
            recipients = (
                await this.q(
                    `SELECT a.toUserId AS id, a.toUserName AS fullName, COUNT(*) AS assignments, COUNT(DISTINCT a.prospectId) AS prospects
                     FROM prospect_assignments a LEFT JOIN prospects p ON p.id = a.prospectId
                     WHERE ${where} AND a.toUserId IS NOT NULL GROUP BY a.toUserId, a.toUserName ORDER BY assignments DESC`,
                    params,
                )
            ).map((r) => ({ ...r, assignments: n(r.assignments), prospects: n(r.prospects) }));
        }

        return {
            message: await this.t('prospect.assignments_retrieved', lang),
            data: paginated(data, n(countRow?.c), page, limit, { recipients }),
        };
    }

    // ============================================================
    // JOURNAL DES ACTIVITÉS
    // ============================================================
    async activities(q: ProspectActivitiesQueryDto, lang = 'fr') {
        const { page, limit, skip } = pageParams(q, 50, 200);
        const parts: string[] = ['1 = 1'];
        const params: any[] = [];
        if (q.userId) {
            parts.push('h.userId = ?');
            params.push(q.userId);
        }
        if (q.prospectId) {
            parts.push('h.prospectId = ?');
            params.push(q.prospectId);
        }
        if (q.action) {
            parts.push('h.action = ?');
            params.push(q.action);
        }
        const { start, end } = this.dateRange(q);
        if (start) {
            parts.push('h.createdAt >= ?');
            params.push(start);
        }
        if (end) {
            parts.push('h.createdAt <= ?');
            params.push(end);
        }
        const where = parts.join(' AND ');
        const [countRow] = await this.q(`SELECT COUNT(*) AS c FROM prospect_history h WHERE ${where}`, params);
        const rows = await this.q(`SELECT h.* FROM prospect_history h WHERE ${where} ORDER BY h.createdAt DESC LIMIT ${limit} OFFSET ${skip}`, params);
        const byAction = await this.q(`SELECT h.action, COUNT(*) AS c FROM prospect_history h WHERE ${where} GROUP BY h.action ORDER BY c DESC`, params);
        const parse = (v: any) => {
            if (v == null || typeof v !== 'string') return v ?? null;
            try {
                return JSON.parse(v);
            } catch {
                return v;
            }
        };
        return {
            message: await this.t('prospect.activities_retrieved', lang),
            data: paginated(
                rows.map((r) => ({ ...r, changes: parse(r.changes), metadata: parse(r.metadata) })),
                n(countRow?.c),
                page,
                limit,
                { byAction: byAction.map((r) => ({ action: r.action, count: n(r.c) })) },
            ),
        };
    }
}
