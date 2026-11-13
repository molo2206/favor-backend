import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';

import { Product } from 'src/products/entities/product.entity';
import { Type_rental_both_sale_car } from 'src/products/enum/type_rental_both_sale_car';
import { RentalCategory } from 'src/products/enum/rental-category.enum';
import { VehicleTechnicalControlService } from 'src/vehicle-technical-control/vehicle-technical-control.service';
import { OrganizationVehicleRental } from './entities/organization-vehicle-rental.entity';
import { OrganizationRentalPayment } from './entities/organization-rental-payment.entity';
import {
  OrganizationRentalPaymentMethod,
  OrganizationRentalPaymentStatus,
  OrganizationRentalStatus,
} from './enums/organization-rental.enum';
import {
  ConfirmOrganizationRentalPaymentDto,
  CreateOrganizationRentalDto,
  PayOrganizationRentalDto,
  UpdateOrganizationRentalStatusDto,
} from './dto/organization-rental.dto';

@Injectable()
export class OrganizationVehicleRentalService {
  private readonly logger = new Logger(OrganizationVehicleRentalService.name);

  constructor(
    @InjectRepository(OrganizationVehicleRental)
    private readonly rentalRepo: Repository<OrganizationVehicleRental>,
    @InjectRepository(OrganizationRentalPayment)
    private readonly paymentRepo: Repository<OrganizationRentalPayment>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly technicalControl: VehicleTechnicalControlService,
  ) {}

  private reference(prefix: string): string {
    const d = new Date();
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    return `${prefix}-${ymd}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private daysBetween(startDate: string, endDate: string): number {
    const s = new Date(`${startDate}T00:00:00Z`).getTime();
    const e = new Date(`${endDate}T00:00:00Z`).getTime();
    if (isNaN(s) || isNaN(e)) throw new BadRequestException('Dates invalides (format AAAA-MM-JJ attendu).');
    if (e < s) throw new BadRequestException('La date de fin doit être postérieure ou égale à la date de début.');
    return Math.max(1, Math.round((e - s) / 86400000) + 1);
  }

  // ============================================================
  // CRÉATION DE LA RÉSERVATION (aucun paiement déclenché)
  // ============================================================
  async createReservation(dto: CreateOrganizationRentalDto, userId: string) {
    const product = await this.productRepo.findOne({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Véhicule (produit) introuvable');

    const t = (product as any).typecar;
    const isRentalCar = t === Type_rental_both_sale_car.RENTAL || t === Type_rental_both_sale_car.BOTH;
    if (!isRentalCar) {
      throw new BadRequestException('Ce produit n\'est pas un véhicule de location.');
    }
    if ((product as any).rentalCategory !== RentalCategory.ORGANIZATION) {
      throw new BadRequestException(
        'Ce véhicule n\'est pas configuré pour la location organisation (rentalCategory = ORGANIZATION).',
      );
    }

    // ✅ Gate : contrôle technique VALIDE et non expiré obligatoire
    const valid = await this.technicalControl.isVehicleControlValid(dto.productId);
    if (!valid) {
      throw new ForbiddenException(
        'Location impossible : ce véhicule n\'a pas de contrôle technique valide (validé et non expiré).',
      );
    }

    const dailyRate = Number((product as any).dailyRate ?? 0);
    if (!dailyRate || dailyRate <= 0) {
      throw new BadRequestException('Le prix de location journalier (dailyRate) du véhicule est manquant.');
    }

    const days = this.daysBetween(dto.startDate, dto.endDate);
    const totalAmount = Number((days * dailyRate).toFixed(2));

    const rental = this.rentalRepo.create({
      reference: this.reference('OVR'),
      productId: product.id,
      ownerId: (product as any).ownerId ?? null,
      clientId: dto.clientId || userId,
      organizationName: dto.organizationName ?? null,
      startDate: dto.startDate,
      endDate: dto.endDate,
      days,
      dailyRate,
      totalAmount,
      currency: (product as any).currency || 'USD',
      responsibilities: (product as any).organizationRentalTerms ?? {
        maintenanceAndDriverBy: 'OWNER',
        fuelBy: 'CLIENT',
        paymentAfterService: true,
      },
      status: OrganizationRentalStatus.PENDING,
      notes: dto.notes ?? null,
      createdById: userId,
    });
    await this.rentalRepo.save(rental);

    return {
      message: 'Réservation créée (paiement après prestation)',
      data: rental,
    };
  }

  // ============================================================
  // CONSULTATION
  // ============================================================
  private async getRentalOrFail(id: string): Promise<OrganizationVehicleRental> {
    const rental = await this.rentalRepo.findOne({ where: { id } });
    if (!rental) throw new NotFoundException('Réservation introuvable');
    return rental;
  }

  async getReservation(id: string) {
    const rental = await this.getRentalOrFail(id);
    const payments = await this.paymentRepo.find({ where: { rentalId: id }, order: { createdAt: 'DESC' } });
    return { message: 'Réservation', data: { rental, payments } };
  }

  async listReservations(filter: { productId?: string; clientId?: string; ownerId?: string; status?: string }) {
    const qb = this.rentalRepo.createQueryBuilder('r');
    if (filter.productId) qb.andWhere('r.productId = :p', { p: filter.productId });
    if (filter.clientId) qb.andWhere('r.clientId = :c', { c: filter.clientId });
    if (filter.ownerId) qb.andWhere('r.ownerId = :o', { o: filter.ownerId });
    if (filter.status) qb.andWhere('r.status = :s', { s: filter.status });
    qb.orderBy('r.createdAt', 'DESC');
    const data = await qb.getMany();
    return { message: `${data.length} réservation(s)`, data };
  }

  // ============================================================
  // STATUTS (admin)
  // ============================================================
  async updateStatus(id: string, dto: UpdateOrganizationRentalStatusDto) {
    const rental = await this.getRentalOrFail(id);
    if (rental.status === OrganizationRentalStatus.PAID) {
      throw new BadRequestException('Réservation déjà payée : statut non modifiable.');
    }
    if (rental.status === OrganizationRentalStatus.CANCELLED) {
      throw new BadRequestException('Réservation annulée : statut non modifiable.');
    }
    rental.status = dto.status as OrganizationRentalStatus;
    await this.rentalRepo.save(rental);
    return { message: 'Statut de la réservation mis à jour', data: rental };
  }

  // ============================================================
  // PAIEMENT APRÈS PRESTATION
  // ============================================================
  async payAfterService(id: string, dto: PayOrganizationRentalDto, userId: string) {
    const rental = await this.getRentalOrFail(id);

    if (rental.status === OrganizationRentalStatus.PAID) {
      throw new BadRequestException('Cette réservation est déjà réglée (pas de double paiement).');
    }
    if (rental.status === OrganizationRentalStatus.CANCELLED) {
      throw new BadRequestException('Réservation annulée : paiement impossible.');
    }
    // Le paiement n'intervient qu'APRÈS la prestation
    if (rental.status !== OrganizationRentalStatus.COMPLETED) {
      throw new ForbiddenException(
        'Le paiement intervient après la prestation : la réservation doit être au statut COMPLETED.',
      );
    }

    const existingSuccess = await this.paymentRepo.findOne({
      where: { rentalId: id, status: OrganizationRentalPaymentStatus.SUCCESS },
    });
    if (existingSuccess) {
      throw new BadRequestException('Un paiement a déjà été confirmé pour cette réservation.');
    }

    const payment = this.paymentRepo.create({
      reference: this.reference('ORP'),
      rentalId: id,
      amount: Number(rental.totalAmount),
      currency: rental.currency,
      method: dto.method,
      status: OrganizationRentalPaymentStatus.PENDING,
      paymentMethodId: dto.paymentMethodId ?? null,
      payerId: rental.clientId ?? userId,
      beneficiaryId: rental.ownerId ?? null,
      createdById: userId,
    });

    rental.paymentMethod = dto.method;

    if (dto.method === OrganizationRentalPaymentMethod.CASH) {
      // ✅ Espèces : enregistré/confirmé par l'admin, pas de fournisseur externe
      payment.status = OrganizationRentalPaymentStatus.SUCCESS;
      payment.paidAt = new Date();
      await this.paymentRepo.save(payment);

      rental.status = OrganizationRentalStatus.PAID;
      await this.rentalRepo.save(rental);

      return {
        message: 'Paiement en espèces enregistré : réservation réglée',
        data: { paymentReference: payment.reference, status: payment.status, rentalStatus: rental.status },
      };
    }

    // ✅ FPAY / MOBILE_MONEY : paiement en attente, confirmé via le flux de paiement (classified-payment).
    //    👉 POINT D'INTÉGRATION : déclencher ici l'encaissement (F-Pay / Mobile Money) avec
    //       payment.reference comme référence externe ; la confirmation effective appelle confirmPayment().
    await this.paymentRepo.save(payment);
    await this.rentalRepo.save(rental);

    return {
      message: 'Paiement initié : à confirmer via le mécanisme de paiement',
      data: { paymentReference: payment.reference, amount: Number(payment.amount), currency: payment.currency, status: payment.status },
    };
  }

  /** Confirme un paiement FPAY/MOBILE_MONEY (callback). Idempotent (anti double validation). */
  async confirmPayment(dto: ConfirmOrganizationRentalPaymentDto) {
    const payment = await this.paymentRepo.findOne({ where: { reference: dto.reference } });
    if (!payment) throw new NotFoundException('Paiement introuvable');

    if (payment.status === OrganizationRentalPaymentStatus.SUCCESS) {
      return { message: 'Paiement déjà confirmé', data: { reference: payment.reference } };
    }
    if (payment.status === OrganizationRentalPaymentStatus.CANCELLED) {
      throw new BadRequestException('Paiement annulé : impossible à confirmer.');
    }

    payment.status = OrganizationRentalPaymentStatus.SUCCESS;
    payment.providerReference = dto.providerReference ?? payment.providerReference ?? null;
    payment.paidAt = new Date();
    await this.paymentRepo.save(payment);

    const rental = await this.getRentalOrFail(payment.rentalId);
    rental.status = OrganizationRentalStatus.PAID;
    await this.rentalRepo.save(rental);

    return {
      message: 'Paiement confirmé : réservation réglée',
      data: { reference: payment.reference, rentalId: rental.id, rentalStatus: rental.status },
    };
  }

  async getPayments(rentalId: string) {
    const payments = await this.paymentRepo.find({ where: { rentalId }, order: { createdAt: 'DESC' } });
    return { message: `${payments.length} paiement(s)`, data: payments };
  }
}
