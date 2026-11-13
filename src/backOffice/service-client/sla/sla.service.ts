import {
    BadRequestException,
    Injectable,
    NotFoundException,
    OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SlaEntity } from './entities/sla.entity';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { I18nService } from 'src/libs/common/src';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { SlaQueryDto } from './dto/sla-query.dto';
import { pageParams } from '../common/list-query';

@Injectable()
export class SlaService implements OnModuleInit {
    constructor(
        @InjectRepository(SlaEntity)
        private readonly slaRepo: Repository<SlaEntity>,

        private readonly i18nService: I18nService,
    ) { }

    // ============================================================
    // 🌱 SEED PAR DÉFAUT AU DÉMARRAGE
    // ============================================================
    async onModuleInit() {
        const count = await this.slaRepo.count();
        if (count === 0) {
            const defaults: Partial<SlaEntity>[] = [
                { priority: TicketPriority.CRITICAL, firstResponseMinutes: 15, resolutionMinutes: 120 },
                { priority: TicketPriority.URGENT, firstResponseMinutes: 30, resolutionMinutes: 240 },
                { priority: TicketPriority.HIGH, firstResponseMinutes: 60, resolutionMinutes: 480 },
                { priority: TicketPriority.NORMAL, firstResponseMinutes: 240, resolutionMinutes: 1440 },
                { priority: TicketPriority.LOW, firstResponseMinutes: 480, resolutionMinutes: 2880 },
            ];
            await this.slaRepo.save(defaults.map((d) => this.slaRepo.create(d)));
            console.log('✅ [SLA] Seed par défaut créé');
        }
    }

    // ============================================================
    // 📋 LISTER LES SLA (filtre priorité + pagination PaginatedResponseDto)
    // ============================================================
    async findAll(
        q: SlaQueryDto = {},
        lang: string = 'fr',
    ): Promise<{ message: string; data: PaginatedResponseDto<SlaEntity> }> {
        const { page, limit } = pageParams(q.page, q.limit);
        const order = q.sortOrder === 'DESC' ? 'DESC' : 'ASC';
        const query = this.slaRepo.createQueryBuilder('s');
        if (q.priority?.length) query.andWhere('s.priority IN (:...priority)', { priority: q.priority });
        if (q.sortBy && q.sortBy !== 'priority') query.orderBy(`s.${q.sortBy}`, order);
        // Priorité : de la plus critique à la plus basse
        else query.orderBy("FIELD(s.priority, 'CRITICAL', 'URGENT', 'HIGH', 'NORMAL', 'LOW')", order);
        query.addOrderBy('s.id', 'ASC').offset((page - 1) * limit).limit(limit);
        const [slas, total] = await query.getManyAndCount();

        return {
            message: await this.i18nService.translate(total > 0 ? 'sla.list_retrieved' : 'sla.not_found', lang),
            data: new PaginatedResponseDto<SlaEntity>(slas, total, page, limit),
        };
    }

    // ============================================================
    // 🔍 VOIR UN SLA PAR PRIORITÉ
    // ============================================================
    async findByPriority(
        priority: TicketPriority,
        lang: string = 'fr',
    ): Promise<{ message: string; data: SlaEntity }> {
        const sla = await this.slaRepo.findOne({ where: { priority } });

        if (!sla) {
            throw new NotFoundException(
                await this.i18nService.translate('sla.not_found_by_priority', lang, {
                    priority,
                }),
            );
        }

        return {
            message: await this.i18nService.translate('sla.found_success', lang, {
                priority,
            }),
            data: sla,
        };
    }

    // ============================================================
    // ⬆️ CRÉER OU METTRE À JOUR UN SLA
    // ============================================================
    async upsert(
        priority: TicketPriority,
        firstResponseMinutes: number,
        resolutionMinutes: number,
        lang: string = 'fr',
    ): Promise<{ message: string; data: SlaEntity }> {
        // 🔒 Validations
        if (!priority) {
            throw new BadRequestException(
                await this.i18nService.translate('sla.priority_required', lang),
            );
        }

        if (
            firstResponseMinutes === undefined ||
            firstResponseMinutes === null ||
            firstResponseMinutes < 0
        ) {
            throw new BadRequestException(
                await this.i18nService.translate('sla.first_response_invalid', lang),
            );
        }

        if (
            resolutionMinutes === undefined ||
            resolutionMinutes === null ||
            resolutionMinutes < 0
        ) {
            throw new BadRequestException(
                await this.i18nService.translate('sla.resolution_invalid', lang),
            );
        }

        if (firstResponseMinutes > resolutionMinutes) {
            throw new BadRequestException(
                await this.i18nService.translate('sla.first_response_too_long', lang),
            );
        }

        // 🔍 Recherche
        let sla = await this.slaRepo.findOne({ where: { priority } });
        let isNew = false;

        if (!sla) {
            sla = this.slaRepo.create({ priority, firstResponseMinutes, resolutionMinutes });
            isNew = true;
        } else {
            sla.firstResponseMinutes = firstResponseMinutes;
            sla.resolutionMinutes = resolutionMinutes;
        }

        const saved = await this.slaRepo.save(sla);

        return {
            message: await this.i18nService.translate(
                isNew ? 'sla.created_success' : 'sla.updated_success',
                lang,
                { priority },
            ),
            data: saved,
        };
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN SLA (optionnel)
    // ============================================================
    async remove(
        priority: TicketPriority,
        lang: string = 'fr',
    ): Promise<{ message: string }> {
        const { data: sla } = await this.findByPriority(priority, lang);
        await this.slaRepo.remove(sla);

        return {
            message: await this.i18nService.translate('sla.deleted_success', lang, {
                priority,
            }),
        };
    }

    // ============================================================
    // ⏱️ CALCUL DE LA DEADLINE (utilitaire interne)
    // ============================================================
    async computeDeadline(priority: TicketPriority, startDate: Date): Promise<Date> {
        const { data: sla } = await this.findByPriority(priority);
        const deadline = new Date(startDate);
        deadline.setMinutes(deadline.getMinutes() + sla.resolutionMinutes);
        return deadline;
    }
}