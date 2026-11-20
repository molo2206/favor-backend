import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { QuotationStatus } from '../common/enums/quotation-status.enum';
import { QuotationEntity } from './entities/quotation.entity';
import { QuotationItemEntity } from './entities/quotation-item.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { ProspectEntity } from '../prospects/entities/prospect.entity';
import { Product } from 'src/products/entities/product.entity';
import { I18nService } from 'src/libs/common/src';

@Injectable()
export class QuotationsService {
    constructor(
        @InjectRepository(QuotationEntity)
        private readonly quotationRepo: Repository<QuotationEntity>,

        @InjectRepository(QuotationItemEntity)
        private readonly quotationItemRepo: Repository<QuotationItemEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepo: Repository<UserEntity>,

        @InjectRepository(ProspectEntity)
        private readonly prospectRepo: Repository<ProspectEntity>,

        @InjectRepository(Product)
        private readonly productRepo: Repository<Product>,

        private readonly i18nService: I18nService,
    ) { }

    // ============================================================
    // 🔢 GÉNÉRATION DU NUMÉRO DE DEVIS
    // ============================================================
    private generateNumber(): string {
        const year = new Date().getFullYear();
        const random = Math.floor(1000 + Math.random() * 9000);
        return `DEV-${year}-${random}`;
    }

    // ============================================================
    // 🔒 VÉRIFIER UN CLIENT (customerId = users.id)
    // ============================================================
    private async validateCustomer(
        customerId: string,
        lang: string = 'fr',
    ): Promise<UserEntity> {
        const customer = await this.userRepo.findOne({
            where: { id: customerId },
        });

        if (!customer) {
            throw new NotFoundException(
                await this.i18nService.translate('quotation.customer_not_found', lang, {
                    id: customerId,
                }),
            );
        }

        return customer;
    }

    // ============================================================
    // 🔒 VÉRIFIER UN PROSPECT
    // ============================================================
    private async validateProspect(
        prospectId: string,
        lang: string = 'fr',
    ): Promise<ProspectEntity> {
        const prospect = await this.prospectRepo.findOne({
            where: { id: prospectId },
        });

        if (!prospect) {
            throw new NotFoundException(
                await this.i18nService.translate('quotation.prospect_not_found', lang, {
                    id: prospectId,
                }),
            );
        }

        return prospect;
    }

    // ============================================================
    // 🔒 VÉRIFIER UN COMMERCIAL
    // ============================================================
    private async validateSalesRep(
        salesRepId: string,
        lang: string = 'fr',
    ): Promise<UserEntity> {
        const user = await this.userRepo.findOne({ where: { id: salesRepId } });

        if (!user) {
            throw new NotFoundException(
                await this.i18nService.translate('quotation.sales_rep_not_found', lang, {
                    id: salesRepId,
                }),
            );
        }

        if (!user.isActive) {
            throw new BadRequestException(
                await this.i18nService.translate('quotation.sales_rep_inactive', lang, {
                    name: user.fullName,
                }),
            );
        }

        return user;
    }

    // ============================================================
    // 🔒 VÉRIFIER UN PRODUIT
    // ============================================================
    private async validateProduct(
        productId: string,
        lang: string = 'fr',
    ): Promise<Product> {
        const product = await this.productRepo.findOne({
            where: { id: productId },
        });

        if (!product) {
            throw new NotFoundException(
                await this.i18nService.translate('quotation.product_not_found', lang, {
                    id: productId,
                }),
            );
        }

        return product;
    }

    // ============================================================
    // 🧮 CALCUL DES TOTAUX
    // ============================================================
    private computeTotals(dto: {
        items: { quantity: number; unitPrice: number }[];
        discountRate?: number;
        taxRate?: number;
    }) {
        const items = dto.items || [];

        const subtotal = items.reduce(
            (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
            0,
        );

        const discountAmount = subtotal * (Number(dto.discountRate || 0) / 100);
        const taxable = subtotal - discountAmount;
        const taxAmount = taxable * (Number(dto.taxRate || 0) / 100);
        const total = taxable + taxAmount;

        return {
            subtotal: Number(subtotal.toFixed(2)),
            discountAmount: Number(discountAmount.toFixed(2)),
            taxAmount: Number(taxAmount.toFixed(2)),
            total: Number(total.toFixed(2)),
        };
    }

    // ============================================================
    // ➕ CRÉER UN DEVIS
    // ============================================================
    async create(
        dto: CreateQuotationDto,
        lang: string = 'fr',
    ): Promise<{ message: string; data: QuotationEntity }> {
        // 1. Validations de base
        if (!dto.items || dto.items.length === 0) {
            throw new BadRequestException(
                await this.i18nService.translate('quotation.items_required', lang),
            );
        }

        // 2. Règle : client OU prospect (pas les deux, pas aucun)
        if (!dto.customerId && !dto.prospectId) {
            throw new BadRequestException(
                await this.i18nService.translate('quotation.customer_or_prospect_required', lang),
            );
        }

        if (dto.customerId && dto.prospectId) {
            throw new BadRequestException(
                await this.i18nService.translate('quotation.customer_and_prospect_exclusive', lang),
            );
        }

        // 3. Vérifier le client (si fourni)
        if (dto.customerId) {
            await this.validateCustomer(dto.customerId, lang);
        }

        // 4. Vérifier le prospect (si fourni)
        if (dto.prospectId) {
            await this.validateProspect(dto.prospectId, lang);
        }

        // 5. Vérifier le commercial (si fourni)
        if (dto.salesRepId) {
            await this.validateSalesRep(dto.salesRepId, lang);
        }

        // 6. Vérifier les produits
        for (const item of dto.items) {
            if (item.productId) {
                await this.validateProduct(item.productId, lang);
            }
        }

        // 7. Calculs
        const { subtotal, total } = this.computeTotals(dto);

        // 8. Création
        const quotation = this.quotationRepo.create({
            number: this.generateNumber(),
            customerId: dto.customerId,
            prospectId: dto.prospectId,
            salesRepId: dto.salesRepId,
            currency: dto.currency || 'USD',
            discountRate: dto.discountRate || 0,
            taxRate: dto.taxRate || 0,
            subtotal,
            total,
            validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
            paymentTerms: dto.paymentTerms,
            status: dto.status || QuotationStatus.DRAFT,
            items: dto.items.map((item) => {
                const quantity = Number(item.quantity || 0);
                const unitPrice = Number(item.unitPrice || 0);
                const totalPrice = Number((quantity * unitPrice).toFixed(2));

                return this.quotationItemRepo.create({
                    description: item.description,
                    quantity,
                    unitPrice,
                    totalPrice,
                    productId: item.productId,
                });
            }),
        });

        const saved = await this.quotationRepo.save(quotation);

        // 9. Recharger avec relations
        const full = await this.quotationRepo.findOne({
            where: { id: saved.id },
            relations: ['customer', 'prospect', 'salesRep', 'items', 'items.product'],
        });

        return {
            message: await this.i18nService.translate('quotation.created_success', lang, {
                number: saved.number,
            }),
            data: full ?? saved,
        };
    }

    // ============================================================
    // 📋 LISTER LES DEVIS
    // ============================================================
    async findAll(
        filters: {
            status?: QuotationStatus;
            customerId?: string;
            prospectId?: string;   // ✅ NOUVEAU
            salesRepId?: string;
            page?: number;
            limit?: number;
        },
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: {
            data: QuotationEntity[];
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }> {
        const {
            status,
            customerId,
            prospectId,
            salesRepId,
            page = 1,
            limit = 10,
        } = filters;

        const qb = this.quotationRepo
            .createQueryBuilder('q')
            .leftJoinAndSelect('q.customer', 'customer')
            .leftJoinAndSelect('q.prospect', 'prospect')   // ✅ NOUVEAU
            .leftJoinAndSelect('q.salesRep', 'salesRep')
            .leftJoinAndSelect('q.items', 'items')
            .orderBy('q.createdAt', 'DESC');

        if (status) qb.andWhere('q.status = :status', { status });
        if (customerId?.trim()) {
            qb.andWhere('q.customerId = :customerId', { customerId: customerId.trim() });
        }
        if (prospectId?.trim()) {
            qb.andWhere('q.prospectId = :prospectId', { prospectId: prospectId.trim() });   // ✅ NOUVEAU
        }
        if (salesRepId?.trim()) {
            qb.andWhere('q.salesRepId = :salesRepId', { salesRepId: salesRepId.trim() });
        }

        const currentPage = Math.max(1, Number(page) || 1);
        const currentLimit = Math.max(1, Number(limit) || 10);
        const skip = (currentPage - 1) * currentLimit;

        qb.skip(skip).take(currentLimit);

        const [quotations, total] = await qb.getManyAndCount();

        if (!quotations.length) {
            throw new NotFoundException(
                await this.i18nService.translate('quotation.not_found', lang),
            );
        }

        return {
            message: await this.i18nService.translate('quotation.list_retrieved', lang),
            data: {
                data: quotations,
                total,
                page: currentPage,
                limit: currentLimit,
                totalPages: Math.ceil(total / currentLimit),
            },
        };
    }

    // ============================================================
    // 🔍 VOIR UN DEVIS
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: QuotationEntity }> {
        const quotation = await this.quotationRepo.findOne({
            where: { id },
            relations: [
                'customer',       // ✅ UserEntity
                'prospect',       // ✅ ProspectEntity
                'salesRep',
                'items',
                'items.product',
            ],
        });

        if (!quotation) {
            throw new NotFoundException(
                await this.i18nService.translate('quotation.not_found_by_id', lang, { id }),
            );
        }

        return {
            message: await this.i18nService.translate('quotation.found_success', lang, {
                number: quotation.number,
            }),
            data: quotation,
        };
    }

    // ============================================================
    // ✏️ MODIFIER UN DEVIS
    // ============================================================
    async update(
        id: string,
        dto: UpdateQuotationDto,
        lang: string = 'fr',
    ): Promise<{ message: string; data: QuotationEntity }> {
        const { data: quotation } = await this.findOne(id, lang);

        // 🔒 Empêcher la modification si ACCEPTED / REJECTED
        if (
            quotation.status === QuotationStatus.ACCEPTED ||
            quotation.status === QuotationStatus.REJECTED
        ) {
            throw new BadRequestException(
                await this.i18nService.translate('quotation.cannot_modify_finalized', lang, {
                    current: quotation.status,
                }),
            );
        }

        // 1. Règle : client OU prospect (pas les deux)
        const futureCustomerId =
            dto.customerId !== undefined ? dto.customerId : quotation.customerId;
        const futureProspectId =
            dto.prospectId !== undefined ? dto.prospectId : quotation.prospectId;

        if (futureCustomerId && futureProspectId) {
            throw new BadRequestException(
                await this.i18nService.translate('quotation.customer_and_prospect_exclusive', lang),
            );
        }

        if (!futureCustomerId && !futureProspectId) {
            throw new BadRequestException(
                await this.i18nService.translate('quotation.customer_or_prospect_required', lang),
            );
        }

        // 2. Vérifier le nouveau client (si changé)
        if (dto.customerId && dto.customerId !== quotation.customerId) {
            await this.validateCustomer(dto.customerId, lang);
        }

        // 3. Vérifier le nouveau prospect (si changé)
        if (dto.prospectId && dto.prospectId !== quotation.prospectId) {
            await this.validateProspect(dto.prospectId, lang);
        }

        // 4. Vérifier le nouveau commercial
        if (dto.salesRepId && dto.salesRepId !== quotation.salesRepId) {
            await this.validateSalesRep(dto.salesRepId, lang);
        }

        // 5. Si les items sont modifiés
        if (dto.items) {
            if (dto.items.length === 0) {
                throw new BadRequestException(
                    await this.i18nService.translate('quotation.items_required', lang),
                );
            }

            for (const item of dto.items) {
                if (item.productId) {
                    await this.validateProduct(item.productId, lang);
                }
            }

            const { subtotal, total } = this.computeTotals({
                items: dto.items,
                discountRate: dto.discountRate ?? quotation.discountRate,
                taxRate: dto.taxRate ?? quotation.taxRate,
            });

            quotation.subtotal = subtotal;
            quotation.total = total;

            await this.quotationItemRepo.delete({ quotationId: quotation.id });

            quotation.items = dto.items.map((item) => {
                const quantity = Number(item.quantity || 0);
                const unitPrice = Number(item.unitPrice || 0);
                const totalPrice = Number((quantity * unitPrice).toFixed(2));

                return this.quotationItemRepo.create({
                    description: item.description,
                    quantity,
                    unitPrice,
                    totalPrice,
                    productId: item.productId,
                });
            });
        } else {
            if (dto.discountRate !== undefined || dto.taxRate !== undefined) {
                const { subtotal, total } = this.computeTotals({
                    items: quotation.items.map((i) => ({
                        quantity: i.quantity,
                        unitPrice: i.unitPrice,
                    })),
                    discountRate: dto.discountRate ?? quotation.discountRate,
                    taxRate: dto.taxRate ?? quotation.taxRate,
                });

                quotation.subtotal = subtotal;
                quotation.total = total;
            }
        }

        // 6. Appliquer les autres modifs
        if (dto.customerId !== undefined) quotation.customerId = dto.customerId;
        if (dto.prospectId !== undefined) quotation.prospectId = dto.prospectId;
        if (dto.salesRepId !== undefined) quotation.salesRepId = dto.salesRepId;
        if (dto.currency !== undefined) quotation.currency = dto.currency;
        if (dto.discountRate !== undefined) quotation.discountRate = dto.discountRate;
        if (dto.taxRate !== undefined) quotation.taxRate = dto.taxRate;
        if (dto.paymentTerms !== undefined) quotation.paymentTerms = dto.paymentTerms;
        if (dto.status !== undefined) quotation.status = dto.status;
        if (dto.validUntil !== undefined) {
            quotation.validUntil = new Date(dto.validUntil);
        }

        const updated = await this.quotationRepo.save(quotation);

        // Recharger pour retour complet
        const full = await this.quotationRepo.findOne({
            where: { id: updated.id },
            relations: ['customer', 'prospect', 'salesRep', 'items', 'items.product'],
        });

        return {
            message: await this.i18nService.translate('quotation.updated_success', lang, {
                number: updated.number,
            }),
            data: full ?? updated,
        };
    }

    // ============================================================
    // 🔄 CHANGER LE STATUT
    // ============================================================
    async updateStatus(
        id: string,
        status: QuotationStatus,
        lang: string = 'fr',
    ): Promise<{ message: string; data: QuotationEntity }> {
        const { data: quotation } = await this.findOne(id, lang);

        if (!status) {
            throw new BadRequestException(
                await this.i18nService.translate('quotation.status_required', lang),
            );
        }

        if (
            quotation.status === QuotationStatus.ACCEPTED ||
            quotation.status === QuotationStatus.REJECTED
        ) {
            throw new BadRequestException(
                await this.i18nService.translate('quotation.cannot_change_finalized', lang, {
                    current: quotation.status,
                }),
            );
        }

        quotation.status = status;

        const now = new Date();
        if (status === QuotationStatus.SENT && !quotation.sentAt) {
            quotation.sentAt = now;
        }
        if (status === QuotationStatus.ACCEPTED && !quotation.acceptedAt) {
            quotation.acceptedAt = now;
        }
        if (status === QuotationStatus.REJECTED && !quotation.rejectedAt) {
            quotation.rejectedAt = now;
        }

        const updated = await this.quotationRepo.save(quotation);

        return {
            message: await this.i18nService.translate('quotation.status_updated_success', lang, {
                status,
            }),
            data: updated,
        };
    }

    // ============================================================
    // 🗑️ SUPPRIMER UN DEVIS
    // ============================================================
    async remove(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string }> {
        const { data: quotation } = await this.findOne(id, lang);

        if (quotation.status === QuotationStatus.ACCEPTED) {
            throw new BadRequestException(
                await this.i18nService.translate('quotation.cannot_delete_accepted', lang),
            );
        }

        await this.quotationRepo.remove(quotation);

        return {
            message: await this.i18nService.translate('quotation.deleted_success', lang, {
                number: quotation.number,
            }),
        };
    }
}