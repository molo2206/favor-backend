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
import { VehicleTechnicalControl } from './entities/vehicle-technical-control.entity';
import { TechnicalControlPayment } from './entities/technical-control-payment.entity';
import { TechnicalControlTariff } from './entities/technical-control-tariff.entity';
import {
  TechnicalControlPaymentStatus,
  TechnicalControlStatus,
} from './enums/technical-control.enum';
import {
  CompleteTechnicalControlDto,
  ConfigureTechnicalControlTariffDto,
  ConfirmTechnicalControlPaymentDto,
  CreateTechnicalControlDto,
  PayTechnicalControlDto,
  RenewTechnicalControlDto,
} from './dto/technical-control.dto';

@Injectable()
export class VehicleTechnicalControlService {
  private readonly logger = new Logger(VehicleTechnicalControlService.name);

  constructor(
    @InjectRepository(VehicleTechnicalControl)
    private readonly controlRepo: Repository<VehicleTechnicalControl>,
    @InjectRepository(TechnicalControlPayment)
    private readonly paymentRepo: Repository<TechnicalControlPayment>,
    @InjectRepository(TechnicalControlTariff)
    private readonly tariffRepo: Repository<TechnicalControlTariff>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  // ============================================================
  // TARIF (super-admin)
  // ============================================================

  /** Tarif actif courant (ou null si aucun configuré). */
  async getActiveTariff(): Promise<TechnicalControlTariff | null> {
    return this.tariffRepo.findOne({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Configurer un nouveau tarif : désactive l'ancien (conservé) et crée le nouveau.
   * Les anciens paiements gardent leur montant (figé par dossier).
   */
  async configureTariff(dto: ConfigureTechnicalControlTariffDto, adminId: string) {
    await this.tariffRepo
      .createQueryBuilder()
      .update(TechnicalControlTariff)
      .set({ isActive: false })
      .where('isActive = :a', { a: true })
      .execute();

    const tariff = this.tariffRepo.create({
      amount: Number(dto.amount),
      currency: (dto.currency || 'USD').toUpperCase(),
      isActive: true,
      configuredById: adminId,
      note: dto.note ?? null,
    });
    await this.tariffRepo.save(tariff);
    return { message: 'Tarif du contrôle technique mis à jour', data: tariff };
  }

  // ============================================================
  // CRÉATION D'UNE DEMANDE DE CONTRÔLE
  // ============================================================

  private async loadRentalVehicle(productId: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id: productId },
      relations: ['brand', 'owner'],
    });
    if (!product) throw new NotFoundException('Véhicule (produit) introuvable');

    // Uniquement pour les véhicules de LOCATION (RENTAL ou BOTH)
    const t = (product as any).typecar;
    if (t !== Type_rental_both_sale_car.RENTAL && t !== Type_rental_both_sale_car.BOTH) {
      throw new BadRequestException(
        'Le contrôle technique ne concerne que les véhicules de location (RENTAL ou BOTH).',
      );
    }
    return product;
  }

  private reference(prefix: string): string {
    const d = new Date();
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    return `${prefix}-${ymd}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  /**
   * Crée une fiche de contrôle (PENDING_PAYMENT) + un paiement en attente calculé sur le tarif actif.
   * previousControlId : renseigné lors d'un renouvellement.
   */
  private async openControl(productId: string, userId: string, controlDate?: string, previousControlId?: string) {
    const product = await this.loadRentalVehicle(productId);

    const tariff = await this.getActiveTariff();
    if (!tariff) {
      throw new BadRequestException(
        "Aucun tarif de contrôle technique n'est configuré. Un super-admin doit le définir d'abord.",
      );
    }

    const control = this.controlRepo.create({
      reference: this.reference('TC'),
      productId: product.id,
      vehicleRegistrationNumber: (product as any).registrationNumber ?? null,
      vehicleModel: (product as any).model ?? null,
      vehicleYear: (product as any).year ?? null,
      vehicleBrand: (product as any).brand?.name ?? null,
      ownerId: (product as any).ownerId ?? null,
      controlDate: controlDate ? new Date(controlDate) : null,
      status: TechnicalControlStatus.PENDING_PAYMENT,
      currency: tariff.currency,
      previousControlId: previousControlId ?? null,
      paymentWaived: false,
      createdById: userId,
    });
    await this.controlRepo.save(control);

    const payment = this.paymentRepo.create({
      reference: this.reference('TCP'),
      controlId: control.id,
      amount: Number(tariff.amount),
      currency: tariff.currency,
      status: TechnicalControlPaymentStatus.PENDING,
      payerId: (product as any).ownerId ?? null,
      createdById: userId,
    });
    await this.paymentRepo.save(payment);

    return { control, payment, amountDue: Number(tariff.amount), currency: tariff.currency };
  }

  async createControl(dto: CreateTechnicalControlDto, userId: string) {
    const res = await this.openControl(dto.productId, userId, dto.controlDate);
    return {
      message: 'Demande de contrôle technique créée (paiement en attente)',
      data: res,
    };
  }

  async renewControl(dto: RenewTechnicalControlDto, userId: string) {
    // dernière fiche connue du véhicule (pour relier l'historique)
    const last = await this.controlRepo.findOne({
      where: { productId: dto.productId },
      order: { createdAt: 'DESC' },
    });
    const res = await this.openControl(dto.productId, userId, dto.controlDate, last?.id);
    return {
      message: 'Renouvellement de contrôle technique créé (paiement en attente)',
      data: res,
    };
  }

  /** Montant à payer pour un contrôle (le propriétaire peut le consulter). */
  async getAmountToPay(controlId: string) {
    const control = await this.getControlOrFail(controlId);
    const pending = await this.paymentRepo.findOne({
      where: { controlId, status: TechnicalControlPaymentStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    const confirmed = await this.paymentRepo.findOne({
      where: { controlId, status: TechnicalControlPaymentStatus.CONFIRMED },
    });
    return {
      message: 'Montant du contrôle technique',
      data: {
        controlId: control.id,
        reference: control.reference,
        status: control.status,
        amountDue: confirmed ? 0 : Number(pending?.amount ?? control.amountPaid ?? 0),
        currency: control.currency,
        alreadyPaid: !!confirmed,
      },
    };
  }

  // ============================================================
  // PAIEMENT
  // ============================================================

  private async getControlOrFail(controlId: string): Promise<VehicleTechnicalControl> {
    const control = await this.controlRepo.findOne({ where: { id: controlId } });
    if (!control) throw new NotFoundException('Contrôle technique introuvable');
    return control;
  }

  /**
   * Initie le paiement : garantit une seule transaction active, bloque si déjà payé.
   * NB : l'encaissement effectif passe par le mécanisme de paiement (F-Pay / mode choisi).
   *      La confirmation arrive via confirmPayment() (callback du mécanisme), jamais ici.
   */
  async initiatePayment(controlId: string, dto: PayTechnicalControlDto, userId: string) {
    const control = await this.getControlOrFail(controlId);

    const confirmed = await this.paymentRepo.findOne({
      where: { controlId, status: TechnicalControlPaymentStatus.CONFIRMED },
    });
    if (confirmed) {
      throw new BadRequestException('Ce contrôle technique est déjà payé (pas de double facturation).');
    }

    // Réutiliser le paiement en attente s'il existe (évite les doublons)
    let payment = await this.paymentRepo.findOne({
      where: { controlId, status: TechnicalControlPaymentStatus.PENDING },
      order: { createdAt: 'DESC' },
    });

    if (!payment) {
      const tariff = await this.getActiveTariff();
      payment = this.paymentRepo.create({
        reference: this.reference('TCP'),
        controlId,
        amount: Number(control.amountPaid ?? tariff?.amount ?? 0),
        currency: control.currency || tariff?.currency || 'USD',
        status: TechnicalControlPaymentStatus.PENDING,
        payerId: control.ownerId ?? userId,
        createdById: userId,
      });
    }

    payment.paymentMethod = dto.paymentMethod ?? payment.paymentMethod ?? null;
    payment.paymentMethodId = dto.paymentMethodId ?? payment.paymentMethodId ?? null;
    await this.paymentRepo.save(payment);

    // 👉 POINT D'INTÉGRATION PAIEMENT (F-Pay / mode choisi) :
    //    déclencher ici l'encaissement avec payment.reference comme référence externe,
    //    puis la confirmation effective appellera confirmPayment({ reference }).

    return {
      message: 'Paiement initié : à confirmer via le mécanisme de paiement',
      data: {
        paymentReference: payment.reference,
        amount: Number(payment.amount),
        currency: payment.currency,
        status: payment.status,
      },
    };
  }

  /**
   * Confirme un paiement (appelé par le mécanisme de paiement ou un admin habilité).
   * Idempotent : un paiement déjà confirmé n'est pas re-traité (anti-double validation).
   */
  async confirmPayment(dto: ConfirmTechnicalControlPaymentDto) {
    const payment = await this.paymentRepo.findOne({ where: { reference: dto.reference } });
    if (!payment) throw new NotFoundException('Paiement introuvable');

    if (payment.status === TechnicalControlPaymentStatus.CONFIRMED) {
      return { message: 'Paiement déjà confirmé', data: { reference: payment.reference } };
    }
    if (payment.status === TechnicalControlPaymentStatus.CANCELLED) {
      throw new BadRequestException('Paiement annulé : impossible à confirmer.');
    }

    payment.status = TechnicalControlPaymentStatus.CONFIRMED;
    payment.providerReference = dto.providerReference ?? payment.providerReference ?? null;
    payment.paidAt = new Date();
    await this.paymentRepo.save(payment);

    const control = await this.getControlOrFail(payment.controlId);
    control.amountPaid = Number(payment.amount);
    control.currency = payment.currency;
    if (control.status === TechnicalControlStatus.PENDING_PAYMENT) {
      control.status = TechnicalControlStatus.PAYMENT_CONFIRMED;
    }
    await this.controlRepo.save(control);

    return {
      message: 'Paiement confirmé : le contrôle technique peut être réalisé',
      data: { reference: payment.reference, controlId: control.id, controlStatus: control.status },
    };
  }

  // ============================================================
  // RÉALISATION DU CONTRÔLE (agent / admin)
  // ============================================================

  async startControl(controlId: string, agentId: string) {
    const control = await this.getControlOrFail(controlId);
    if (control.status !== TechnicalControlStatus.PAYMENT_CONFIRMED && !control.paymentWaived) {
      throw new ForbiddenException(
        'Le paiement du contrôle technique doit être confirmé avant de réaliser le contrôle.',
      );
    }
    control.status = TechnicalControlStatus.IN_PROGRESS;
    control.agentId = agentId;
    if (!control.controlDate) control.controlDate = new Date();
    await this.controlRepo.save(control);
    return { message: 'Contrôle technique en cours', data: control };
  }

  async completeControl(controlId: string, dto: CompleteTechnicalControlDto, agentId: string) {
    const control = await this.getControlOrFail(controlId);

    if (control.status === TechnicalControlStatus.VALIDATED || control.status === TechnicalControlStatus.REJECTED) {
      throw new BadRequestException('Ce contrôle a déjà été finalisé.');
    }

    // Paiement obligatoire, sauf dérogation admin tracée
    const confirmed = await this.paymentRepo.findOne({
      where: { controlId, status: TechnicalControlPaymentStatus.CONFIRMED },
    });
    if (!confirmed && !control.paymentWaived) {
      if (!dto.paymentWaivedReason) {
        throw new ForbiddenException(
          "Validation impossible sans paiement confirmé. Pour une exception, fournissez 'paymentWaivedReason' (admin habilité).",
        );
      }
      control.paymentWaived = true;
      control.paymentWaivedReason = dto.paymentWaivedReason;
    }

    control.agentId = agentId;
    if (!control.controlDate) control.controlDate = new Date();
    control.generalState = dto.generalState ?? control.generalState ?? null;
    control.results = dto.results ?? control.results ?? null;
    control.observations = dto.observations ?? control.observations ?? null;
    control.documents = dto.documents ?? control.documents ?? null;
    control.expiryDate = dto.expiryDate ?? control.expiryDate ?? null;
    control.status =
      dto.decision === 'VALIDATED' ? TechnicalControlStatus.VALIDATED : TechnicalControlStatus.REJECTED;

    await this.controlRepo.save(control);
    return {
      message: dto.decision === 'VALIDATED' ? 'Contrôle technique validé' : 'Contrôle technique rejeté',
      data: control,
    };
  }

  // ============================================================
  // CONSULTATION / VALIDITÉ / HISTORIQUE
  // ============================================================

  async getControl(controlId: string) {
    const control = await this.getControlOrFail(controlId);
    const payments = await this.paymentRepo.find({
      where: { controlId },
      order: { createdAt: 'DESC' },
    });
    return { message: 'Fiche de contrôle technique', data: { control, payments } };
  }

  /** Historique des contrôles d'un véhicule (du plus récent au plus ancien). */
  async getVehicleControls(productId: string) {
    const controls = await this.controlRepo.find({
      where: { productId },
      order: { createdAt: 'DESC' },
    });
    return { message: `${controls.length} contrôle(s) technique(s)`, data: controls };
  }

  /**
   * Un véhicule est-il louable aux organisations ?
   * → au moins un contrôle VALIDATED dont l'expiration n'est pas dépassée.
   */
  async isVehicleControlValid(productId: string): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10);
    const valid = await this.controlRepo
      .createQueryBuilder('c')
      .where('c.productId = :pid', { pid: productId })
      .andWhere('c.status = :st', { st: TechnicalControlStatus.VALIDATED })
      .andWhere('(c.expiryDate IS NULL OR c.expiryDate >= :today)', { today })
      .getOne();
    return !!valid;
  }

  async getVehicleControlValidity(productId: string) {
    const valid = await this.isVehicleControlValid(productId);
    return { message: 'Validité du contrôle technique', data: { productId, valid } };
  }

  /** Marque EXPIRED les contrôles validés dont l'échéance est dépassée (appelé par un cron). */
  async expireOutdatedControls(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const res = await this.controlRepo
      .createQueryBuilder()
      .update(VehicleTechnicalControl)
      .set({ status: TechnicalControlStatus.EXPIRED })
      .where('status = :st', { st: TechnicalControlStatus.VALIDATED })
      .andWhere('expiryDate IS NOT NULL')
      .andWhere('expiryDate < :today', { today })
      .execute();
    const affected = res.affected ?? 0;
    if (affected) this.logger.log(`${affected} contrôle(s) technique(s) expiré(s)`);
    return affected;
  }
}
