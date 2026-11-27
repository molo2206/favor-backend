import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { CompanyCapabilitiesService } from 'src/inventory/capabilities/company-capabilities.service';
import { PosCustomer } from './entities/pos-customer.entity';
import { PosSale } from './entities/pos-sale.entity';
import { PosSaleStatus } from './enums/pos.enum';
import { CustomerSearchDto, UpsertCustomerDto } from './dto/pos-customer.dto';

/**
 * Clients propres à chaque entreprise (sans compte système).
 * Recherche par nom/téléphone ; chaque entreprise ne voit QUE ses clients (companyId).
 */
@Injectable()
export class PosCustomerService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly capabilities: CompanyCapabilitiesService,
  ) {}

  private t(key: string, lang: string, args?: any) {
    return this.i18n.translate(key, lang, args);
  }

  private async assertPos(companyId: string, lang: string) {
    const caps = await this.capabilities.forCompany(companyId);
    if (!caps.hasPOS) throw new ForbiddenException(this.t('pos.not_enabled_for_type', lang));
  }

  private clean(s?: string | null) {
    const v = (s ?? '').trim();
    return v.length ? v : null;
  }

  /** Créer ou modifier un client. Si un `phone` existe déjà dans l'entreprise, on met à jour ce client. */
  async upsert(companyId: string, dto: UpsertCustomerDto, lang: string) {
    await this.assertPos(companyId, lang);
    const name = this.clean(dto.name);
    if (!name) throw new BadRequestException(this.t('pos.customer_name_required', lang));
    const repo = this.dataSource.getRepository(PosCustomer);
    const phone = this.clean(dto.phone);

    let customer: PosCustomer | null = null;
    if (dto.id) customer = await repo.findOne({ where: { id: dto.id, companyId } });
    if (!customer && phone) customer = await repo.findOne({ where: { companyId, phone } });

    if (customer) {
      customer.name = name;
      if (dto.phone !== undefined) customer.phone = phone;
      if (dto.email !== undefined) customer.email = this.clean(dto.email);
      if (dto.address !== undefined) customer.address = this.clean(dto.address);
      if (dto.note !== undefined) customer.note = this.clean(dto.note);
      if (dto.userId !== undefined) customer.userId = this.clean(dto.userId);
    } else {
      customer = repo.create({
        ...(dto.id ? { id: dto.id } : {}),
        companyId,
        name,
        phone,
        email: this.clean(dto.email),
        address: this.clean(dto.address),
        note: this.clean(dto.note),
        userId: this.clean(dto.userId),
        isActive: true,
      });
    }
    const saved = await repo.save(customer);
    return { message: this.t('pos.customer_saved', lang), data: saved };
  }

  /** Recherche par nom OU téléphone, limitée à l'entreprise */
  async search(companyId: string, query: CustomerSearchDto, lang: string) {
    await this.assertPos(companyId, lang);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const qb = this.dataSource.getRepository(PosCustomer).createQueryBuilder('c')
      .where('c.companyId = :companyId AND c.isActive = 1', { companyId });

    const term = this.clean(query.search);
    if (term) {
      qb.andWhere(new Brackets((w) => {
        w.where('c.name LIKE :term', { term: `%${term}%` }).orWhere('c.phone LIKE :term', { term: `%${term}%` });
      }));
    }
    const phone = this.clean(query.phone);
    if (phone) qb.andWhere('c.phone LIKE :phone', { phone: `%${phone}%` });

    qb.orderBy('c.name', 'ASC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  /** Détail d'un client + son encours (somme des restes dus de ses ventes) */
  async getOne(companyId: string, id: string, lang: string) {
    await this.assertPos(companyId, lang);
    const customer = await this.dataSource.getRepository(PosCustomer).findOne({ where: { id, companyId } });
    if (!customer) throw new NotFoundException(this.t('pos.customer_not_found', lang));
    const row = await this.dataSource.getRepository(PosSale).createQueryBuilder('s')
      .select('COALESCE(SUM(s.amountDue),0)', 'due')
      .addSelect('COUNT(*)', 'count')
      .where('s.companyId = :companyId AND s.customerId = :id AND s.status = :paid', { companyId, id, paid: PosSaleStatus.PAID })
      .getRawOne();
    return { ...customer, outstandingCredit: Number(row?.due || 0), salesCount: Number(row?.count || 0) };
  }

  /** Ventes d'un client (historique) */
  async sales(companyId: string, id: string, lang: string) {
    await this.assertPos(companyId, lang);
    return this.dataSource.getRepository(PosSale).find({
      where: { companyId, customerId: id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  /** Utilitaire : retrouver (par id ou téléphone) ou créer un client — utilisable par la vente */
  async findOrCreate(companyId: string, data: { id?: string; name?: string; phone?: string }): Promise<PosCustomer | null> {
    const repo = this.dataSource.getRepository(PosCustomer);
    if (data.id) {
      const byId = await repo.findOne({ where: { id: data.id, companyId } });
      if (byId) return byId;
    }
    const phone = this.clean(data.phone);
    if (phone) {
      const byPhone = await repo.findOne({ where: { companyId, phone } });
      if (byPhone) return byPhone;
    }
    const name = this.clean(data.name);
    if (!name && !phone) return null; // rien pour identifier le client
    return repo.save(repo.create({ companyId, name: name || phone!, phone, isActive: true }));
  }
}
