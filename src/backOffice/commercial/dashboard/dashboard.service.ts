import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ProspectEntity } from '../prospects/entities/prospect.entity';
import { CustomerEntity } from '../customers/entities/customer.entity';
import { OpportunityEntity } from '../opportunities/entities/opportunity.entity';
import { ContractEntity } from '../contracts/entities/contract.entity';
import { QuotationEntity } from '../quotations/entities/quotation.entity';
import { OpportunityStage } from '../common/enums/opportunity-stage.enum';
import { CustomerStatus } from '../common/enums/customer.enum';
import { QuotationStatus } from '../common/enums/quotation-status.enum';
import { I18nService } from 'src/libs/common/src';

@Injectable()
export class CommercialDashboardService {
    constructor(
        @InjectRepository(ProspectEntity)
        private readonly prospectRepo: Repository<ProspectEntity>,

        @InjectRepository(CustomerEntity)
        private readonly customerRepo: Repository<CustomerEntity>,

        @InjectRepository(OpportunityEntity)
        private readonly opportunityRepo: Repository<OpportunityEntity>,

        @InjectRepository(QuotationEntity)
        private readonly quotationRepo: Repository<QuotationEntity>,

        @InjectRepository(ContractEntity)
        private readonly contractRepo: Repository<ContractEntity>,

        private readonly i18nService: I18nService,
    ) { }

    // ============================================================
    // 📊 GET FULL DASHBOARD (tout en 1 seul appel)
    // ============================================================
    async getDashboard(
        companyId?: string,
        assignedToId?: string,
        startDate?: string,
        endDate?: string,
        topLimit: number = 5,
        lang: string = 'fr',
    ): Promise<{ message: string; data: any }> {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // 🔹 Période
        const parsedStartDate = startDate ? new Date(startDate) : startOfMonth;
        const parsedEndDate = endDate ? new Date(endDate) : now;
        const adjustedEndDate = new Date(parsedEndDate);
        adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);

        // 🔹 Filtres
        const prospectWhere: any = {};
        const customerWhere: any = {};
        if (companyId) {
            prospectWhere.companyId = companyId;
            customerWhere.companyId = companyId;
        }

        // ============================================================
        // 1️⃣ KPIs GLOBAUX
        // ============================================================
        const [
            totalProspects,
            newProspectsThisMonth,
            totalCustomers,
            activeCustomers,
            newCustomersThisMonth,
            openOpportunities,
            wonOpportunities,
            lostOpportunities,
            sentQuotations,
            acceptedQuotations,
            contractValueRaw,
        ] = await Promise.all([
            this.prospectRepo.count({ where: prospectWhere }),
            this.prospectRepo.count({
                where: { ...prospectWhere, createdAt: Between(startOfMonth, now) },
            }),
            this.customerRepo.count({ where: customerWhere }),
            this.customerRepo.count({
                where: { ...customerWhere, status: CustomerStatus.ACTIVE },
            }),
            this.customerRepo.count({
                where: { ...customerWhere, createdAt: Between(startOfMonth, now) },
            }),
            this.opportunityRepo
                .createQueryBuilder('o')
                .where('o.stage NOT IN (:...closed)', {
                    closed: [OpportunityStage.WON, OpportunityStage.LOST],
                })
                .andWhere(
                    companyId
                        ? 'o.customerId IN (SELECT id FROM commercial_customers WHERE companyId = :companyId)'
                        : '1=1',
                    companyId ? { companyId } : {},
                )
                .getCount(),
            this.opportunityRepo
                .createQueryBuilder('o')
                .where('o.stage = :stage', { stage: OpportunityStage.WON })
                .andWhere(
                    companyId
                        ? 'o.customerId IN (SELECT id FROM commercial_customers WHERE companyId = :companyId)'
                        : '1=1',
                    companyId ? { companyId } : {},
                )
                .getCount(),
            this.opportunityRepo
                .createQueryBuilder('o')
                .where('o.stage = :stage', { stage: OpportunityStage.LOST })
                .andWhere(
                    companyId
                        ? 'o.customerId IN (SELECT id FROM commercial_customers WHERE companyId = :companyId)'
                        : '1=1',
                    companyId ? { companyId } : {},
                )
                .getCount(),
            this.quotationRepo.count({ where: { status: QuotationStatus.SENT } }),
            this.quotationRepo.count({ where: { status: QuotationStatus.ACCEPTED } }),
            this.contractRepo
                .createQueryBuilder('c')
                .select('SUM(c.amount)', 'total')
                .where('c.status = :s', { s: 'ACTIVE' })
                .getRawOne(),
        ]);

        // ============================================================
        // 2️⃣ PIPELINE PAR STAGE
        // ============================================================
        const pipelineRaw = await this.opportunityRepo
            .createQueryBuilder('o')
            .select('o.stage', 'stage')
            .addSelect('COUNT(o.id)', 'count')
            .addSelect('SUM(o.amount)', 'amount')
            .addSelect('AVG(o.probability)', 'avgProbability')
            .addSelect('o.currency', 'currency')
            .where('o.stage NOT IN (:...closed)', {
                closed: [OpportunityStage.WON, OpportunityStage.LOST],
            })
            .groupBy('o.stage')
            .addGroupBy('o.currency')
            .orderBy('o.stage', 'ASC')
            .getRawMany();

        const pipeline = pipelineRaw.map((p) => ({
            stage: p.stage,
            count: Number(p.count),
            amount: Number(p.amount || 0),
            avgProbability: Number(Number(p.avgProbability || 0).toFixed(2)),
            currency: p.currency || 'USD',
        }));

        const pipelineValue = pipeline.reduce((sum, p) => sum + p.amount, 0);

        // ============================================================
        // 3️⃣ VENTES PAR COMMERCIAL
        // ============================================================
        const salesByRepRaw = await this.opportunityRepo
            .createQueryBuilder('o')
            .leftJoin('o.assignedTo', 'salesRep')
            .select('o.assignedToId', 'salesRepId')
            .addSelect('salesRep.fullName', 'salesRepName')
            .addSelect('salesRep.email', 'salesRepEmail')
            .addSelect('COUNT(o.id)', 'wonCount')
            .addSelect('SUM(o.amount)', 'totalAmount')
            .addSelect('o.currency', 'currency')
            .where('o.stage = :stage', { stage: OpportunityStage.WON })
            .groupBy('o.assignedToId')
            .addGroupBy('salesRep.fullName')
            .addGroupBy('salesRep.email')
            .addGroupBy('o.currency')
            .orderBy('SUM(o.amount)', 'DESC')
            .getRawMany();

        const salesByRep = salesByRepRaw.map((s) => ({
            salesRepId: s.salesRepId,
            salesRepName: s.salesRepName || 'Non assigné',
            salesRepEmail: s.salesRepEmail || null,
            wonCount: Number(s.wonCount),
            totalAmount: Number(s.totalAmount || 0),
            currency: s.currency || 'USD',
        }));

        // ============================================================
        // 4️⃣ TOP COMMERCIAUX
        // ============================================================
        const topSalesRepsRaw = await this.opportunityRepo
            .createQueryBuilder('o')
            .leftJoin('o.assignedTo', 'salesRep')
            .select('o.assignedToId', 'salesRepId')
            .addSelect('salesRep.fullName', 'salesRepName')
            .addSelect('COUNT(o.id)', 'wonCount')
            .addSelect('SUM(o.amount)', 'totalAmount')
            .where('o.stage = :stage', { stage: OpportunityStage.WON })
            .groupBy('o.assignedToId')
            .addGroupBy('salesRep.fullName')
            .orderBy('SUM(o.amount)', 'DESC')
            .limit(topLimit)
            .getRawMany();

        const topSalesReps = topSalesRepsRaw.map((t, index) => ({
            rank: index + 1,
            salesRepId: t.salesRepId,
            salesRepName: t.salesRepName || 'Non assigné',
            wonCount: Number(t.wonCount),
            totalAmount: Number(t.totalAmount || 0),
        }));

        // ============================================================
        // 5️⃣ PERFORMANCE PAR PÉRIODE
        // ============================================================
        const wonOpportunitiesInPeriod = await this.opportunityRepo
            .createQueryBuilder('o')
            .select('COUNT(o.id)', 'count')
            .addSelect('SUM(o.amount)', 'totalAmount')
            .addSelect('o.currency', 'currency')
            .where('o.stage = :stage', { stage: OpportunityStage.WON })
            .andWhere('o.createdAt BETWEEN :start AND :end', {
                start: parsedStartDate,
                end: adjustedEndDate,
            })
            .groupBy('o.currency')
            .getRawMany();

        const newProspectsInPeriod = await this.prospectRepo.count({
            where: { createdAt: Between(parsedStartDate, adjustedEndDate) },
        });

        const newCustomersInPeriod = await this.customerRepo.count({
            where: { createdAt: Between(parsedStartDate, adjustedEndDate) },
        });

        const newContractsInPeriod = await this.contractRepo
            .createQueryBuilder('c')
            .select('COUNT(c.id)', 'count')
            .addSelect('SUM(c.amount)', 'totalAmount')
            .where('c.createdAt BETWEEN :start AND :end', {
                start: parsedStartDate,
                end: adjustedEndDate,
            })
            .getRawOne();

        // ============================================================
        // 6️⃣ CALCUL DES KPIs
        // ============================================================
        const totalOpportunities =
            openOpportunities + wonOpportunities + lostOpportunities;

        const conversionRate =
            totalOpportunities > 0
                ? Number(((wonOpportunities / totalOpportunities) * 100).toFixed(2))
                : 0;

        const totalQuotations = sentQuotations + acceptedQuotations;

        const quotationAcceptanceRate =
            totalQuotations > 0
                ? Number(((acceptedQuotations / totalQuotations) * 100).toFixed(2))
                : 0;

        // ============================================================
        // ✅ RÉPONSE CONSOLIDÉE
        // ============================================================
        return {
            message: await this.i18nService.translate('dashboard.retrieved', lang),
            data: {
                // 🔹 KPIs globaux
                stats: {
                    totalProspects,
                    newProspectsThisMonth,
                    totalCustomers,
                    activeCustomers,
                    newCustomersThisMonth,
                    openOpportunities,
                    wonOpportunities,
                    lostOpportunities,
                    totalOpportunities,
                    sentQuotations,
                    acceptedQuotations,
                    totalQuotations,
                    quotationAcceptanceRate,
                    totalContractValue: Number(contractValueRaw?.total || 0),
                    pipelineValue: Number(pipelineValue.toFixed(2)),
                    conversionRate,
                },

                // 🔹 Pipeline
                pipeline,

                // 🔹 Ventes par commercial
                salesByRep,

                // 🔹 Top commerciaux
                topSalesReps,

                // 🔹 Performance sur période
                performance: {
                    period: {
                        start: parsedStartDate,
                        end: parsedEndDate,
                    },
                    wonOpportunities: wonOpportunitiesInPeriod.map((w) => ({
                        count: Number(w.count),
                        totalAmount: Number(w.totalAmount || 0),
                        currency: w.currency || 'USD',
                    })),
                    newProspects: newProspectsInPeriod,
                    newCustomers: newCustomersInPeriod,
                    newContracts: {
                        count: Number(newContractsInPeriod?.count || 0),
                        totalAmount: Number(newContractsInPeriod?.totalAmount || 0),
                    },
                },
            },
        };
    }
}