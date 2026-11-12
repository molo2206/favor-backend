// src/backOffice/commercial/prospects/prospect-tracking.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ProspectEntity } from './entities/prospect.entity';
import { ProspectAssignmentEntity } from './entities/prospect-assignment.entity';
import { ProspectHistoryEntity } from './entities/prospect-history.entity';
import { ProspectAssignmentType, ProspectHistoryAction } from '../common/enums/prospect-tracking.enum';

export type ProspectActor = { id?: string | null; fullName?: string | null; role?: any } | null | undefined;

/** Champs suivis dans l'historique des modifications */
const TRACKED_FIELDS = [
    'fullName', 'companyName', 'email', 'phone', 'address', 'sector', 'source', 'socialNetwork', 'socialNetworkOther',
    'countryId', 'countryName', 'cityId', 'cityName', 'languages', 'identifiedNeed', 'productInterest', 'estimatedBudget',
    'conversionProbability', 'status', 'nextAction', 'nextActionAt', 'lastContactAt', 'assignedToId', 'companyId',
    'branchId', 'lostReason', 'linkedUserId',
];

const ADMIN_ROLES = ['ADMIN', 'SUPER ADMIN'];

/**
 * ✅ SUIVI DES PROSPECTS
 *  - Journal des activités (prospect_history) et des assignations / transferts (prospect_assignments)
 *  - Détection des personnes qui ont déjà un compte, un prospect ou une fiche client (téléphone, e-mail, nom)
 */
@Injectable()
export class ProspectTrackingService {
    private readonly logger = new Logger(ProspectTrackingService.name);

    constructor(
        @InjectRepository(ProspectHistoryEntity) private readonly historyRepo: Repository<ProspectHistoryEntity>,
        @InjectRepository(ProspectAssignmentEntity) private readonly assignmentRepo: Repository<ProspectAssignmentEntity>,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) { }

    // ============================================================
    // RÔLES
    // ============================================================
    roleOf(user: ProspectActor): string {
        const r: any = user?.role;
        return String(Array.isArray(r) ? r[0] : r ?? '').toUpperCase();
    }

    isAdmin(user: ProspectActor): boolean {
        return ADMIN_ROLES.includes(this.roleOf(user));
    }

    private name(user: ProspectActor): string | null {
        return user?.fullName ? String(user.fullName).slice(0, 150) : null;
    }

    // ============================================================
    // JOURNAL
    // ============================================================
    /** Différences entre deux états du prospect (champs suivis seulement) */
    diff(before: Partial<ProspectEntity>, after: Partial<ProspectEntity>): Record<string, [any, any]> {
        const out: Record<string, [any, any]> = {};
        const norm = (v: any) => (v === undefined || v === '' ? null : v instanceof Date ? v.toISOString() : Array.isArray(v) ? JSON.stringify(v) : typeof v === 'number' ? v : v === null ? null : String(v));
        for (const f of TRACKED_FIELDS) {
            const a = norm((before as any)[f]);
            const b = norm((after as any)[f]);
            if (a != b) out[f] = [(before as any)[f] ?? null, (after as any)[f] ?? null];
        }
        return out;
    }

    async log(
        entry: {
            prospect: Pick<ProspectEntity, 'id' | 'fullName'>;
            action: ProspectHistoryAction;
            user?: ProspectActor;
            oldStatus?: string | null;
            newStatus?: string | null;
            changes?: Record<string, [any, any]> | null;
            note?: string | null;
            metadata?: Record<string, any> | null;
        },
        manager?: EntityManager,
    ): Promise<void> {
        try {
            const repo = manager ? manager.getRepository(ProspectHistoryEntity) : this.historyRepo;
            await repo.save(
                repo.create({
                    prospectId: entry.prospect.id,
                    prospectName: entry.prospect.fullName?.slice(0, 255) ?? null,
                    action: entry.action,
                    userId: entry.user?.id ?? null,
                    userName: this.name(entry.user),
                    oldStatus: entry.oldStatus ?? null,
                    newStatus: entry.newStatus ?? null,
                    changes: entry.changes && Object.keys(entry.changes).length ? entry.changes : null,
                    note: entry.note ? String(entry.note).slice(0, 500) : null,
                    metadata: entry.metadata ?? null,
                }),
            );
        } catch (e: any) {
            // L'historique ne doit jamais bloquer l'opération (table absente avant le script SQL…)
            if (manager) throw e;
            this.logger.warn(`Historique prospect non enregistré : ${e?.message}`);
        }
    }

    /** Enregistre un changement de responsable */
    async logAssignment(
        entry: {
            prospect: Pick<ProspectEntity, 'id' | 'fullName' | 'status'>;
            fromUser?: { id: string; fullName?: string | null } | null;
            toUser?: { id: string; fullName?: string | null } | null;
            by?: ProspectActor;
            note?: string | null;
        },
        manager?: EntityManager,
    ): Promise<ProspectAssignmentType> {
        const type = !entry.toUser
            ? ProspectAssignmentType.UNASSIGNED
            : entry.fromUser
                ? ProspectAssignmentType.TRANSFERRED
                : ProspectAssignmentType.ASSIGNED;
        try {
            const repo = manager ? manager.getRepository(ProspectAssignmentEntity) : this.assignmentRepo;
            await repo.save(
                repo.create({
                    prospectId: entry.prospect.id,
                    prospectName: entry.prospect.fullName?.slice(0, 255) ?? null,
                    type,
                    fromUserId: entry.fromUser?.id ?? null,
                    fromUserName: entry.fromUser?.fullName?.slice(0, 150) ?? null,
                    toUserId: entry.toUser?.id ?? null,
                    toUserName: entry.toUser?.fullName?.slice(0, 150) ?? null,
                    assignedById: entry.by?.id ?? null,
                    assignedByName: this.name(entry.by),
                    statusAtAssignment: entry.prospect.status ?? null,
                    note: entry.note ? String(entry.note).slice(0, 500) : null,
                }),
            );
        } catch (e: any) {
            if (manager) throw e;
            this.logger.warn(`Assignation prospect non historisée : ${e?.message}`);
        }
        return type;
    }

    // ============================================================
    // DOUBLONS
    // ============================================================
    /** Chiffres seulement */
    digits(phone?: string | null): string {
        return String(phone ?? '').replace(/\D+/g, '');
    }

    /** 9 derniers chiffres (+243 970 000 000 = 0970000000 = 970000000) */
    phoneTail(phone?: string | null): string | null {
        const d = this.digits(phone);
        if (d.length < 8) return null;
        return d.slice(-9);
    }

    private sqlDigits(col: string): string {
        return `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${col}, ''), ' ', ''), '+', ''), '-', ''), '(', ''), ')', ''), '.', '')`;
    }

    /** Vue d'un compte : complète pour les administrateurs, réduite (masquée) pour les autres */
    accountView(u: any, full: boolean) {
        if (!u) return null;
        const maskPhone = (p?: string | null) => (p ? `${String(p).slice(0, 4)}••••${String(p).slice(-2)}` : null);
        const maskEmail = (e?: string | null) => {
            if (!e) return null;
            const [a, b] = String(e).split('@');
            return `${a.slice(0, 2)}•••@${b ?? ''}`;
        };
        return full
            ? {
                id: u.id,
                fullName: u.fullName,
                email: u.email ?? null,
                phone: u.phone ?? null,
                image: u.image ?? null,
                role: u.role,
                isActive: !!u.isActive,
                city: u.city ?? null,
                country: u.country ?? null,
                createdAt: u.createdAt,
                matchedBy: u.matchedBy ?? null,
            }
            : {
                id: u.id,
                fullName: u.fullName,
                email: maskEmail(u.email),
                phone: maskPhone(u.phone),
                isActive: !!u.isActive,
                createdAt: u.createdAt,
                matchedBy: u.matchedBy ?? null,
            };
    }

    /**
     * Recherche des comptes (users), prospects et fiches clients qui correspondent :
     * téléphone (9 derniers chiffres, quel que soit le format), e-mail (sans casse), nom (indicatif seulement).
     */
    async findDuplicates(input: { phone?: string | null; email?: string | null; fullName?: string | null; excludeProspectId?: string | null }) {
        const tail = this.phoneTail(input.phone);
        const email = input.email ? String(input.email).trim().toLowerCase() : null;
        const users: any[] = [];
        const prospects: any[] = [];
        const customers: any[] = [];
        if (!tail && !email) return { users, prospects, customers};

        const conds = (alias: string, phoneCol = 'phone', emailCol = 'email') => {
            const parts: string[] = [];
            const params: any[] = [];
            if (tail) {
                parts.push(`RIGHT(${this.sqlDigits(`${alias}.${phoneCol}`)}, 9) = ?`);
                params.push(tail);
            }
            if (email) {
                parts.push(`LOWER(TRIM(${alias}.${emailCol})) = ?`);
                params.push(email);
            }
            return { where: `(${parts.join(' OR ')})`, params };
        };
        const matchedBy = (r: any) => {
            const by: string[] = [];
            if (tail && this.phoneTail(r.phone) === tail) by.push('PHONE');
            if (email && String(r.email ?? '').trim().toLowerCase() === email) by.push('EMAIL');
            return by;
        };

        const cu = conds('u');
        const urows: any[] = await this.dataSource
            .query(
                `SELECT u.id, u.fullName, u.email, u.phone, u.image, u.role, u.isActive, u.city, u.country, u.createdAt
                 FROM users u WHERE u.deleted = 0 AND ${cu.where} ORDER BY u.createdAt ASC LIMIT 10`,
                cu.params,
            )
            .catch(() => []);
        for (const r of urows) users.push({ ...r, matchedBy: matchedBy(r) });

        const cp = conds('p');
        const pparams = [...cp.params];
        let pextra = '';
        if (input.excludeProspectId) {
            pextra = ' AND p.id <> ?';
            pparams.push(input.excludeProspectId);
        }
        const prows: any[] = await this.dataSource
            .query(
                `SELECT p.id, p.fullName, p.email, p.phone, p.status, p.createdAt, p.assignedToId, p.createdById, p.linkedUserId,
                        a.fullName AS assignedToName, c.fullName AS createdByName
                 FROM prospects p
                 LEFT JOIN users a ON a.id = p.assignedToId
                 LEFT JOIN users c ON c.id = p.createdById
                 WHERE ${cp.where}${pextra} ORDER BY p.createdAt DESC LIMIT 10`,
                pparams,
            )
            .catch(() => []);
        for (const r of prows) prospects.push({ ...r, matchedBy: matchedBy(r) });

        const cc = conds('c');
        const crows: any[] = await this.dataSource
            .query(
                `SELECT c.id, c.fullName, c.email, c.phone, c.status, c.userId, c.createdAt
                 FROM commercial_customers c WHERE ${cc.where} ORDER BY c.createdAt DESC LIMIT 10`,
                cc.params,
            )
            .catch(() => []);
        for (const r of crows) customers.push({ ...r, matchedBy: matchedBy(r) });

        return { users, prospects, customers};
    }
}
