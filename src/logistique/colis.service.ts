import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { ColisEntity, ColisStatus } from './entity/colis.entity';
import { ColisTrackingEntity, ColisTrackingStatus } from './entity/colis-tracking.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { CreateColisDto } from './dto/create-colis.dto';
import { SetColisPriceDto } from './dto/set-price.dto';
import { AssignCourierDto } from './dto/assign-courier.dto';
import { CollectPickupPaymentDto } from './dto/pickup-payment.dto';
import { PickupTariffService } from 'src/pickup-tariff/pickup-tariff.service';
import { ColisPickupPaymentStatus, ColisPickupPaymentTiming } from './enum/colis-pickup.enum';
import { PaymentMethod } from 'src/operation/enum/payment-method.enum';
import { FpayService } from 'src/fpay/fpay.service';
import { TrackingNumberUtil } from 'src/users/utility/helpers/tracking-number.util';
import { GeneratePin } from 'src/users/utility/helpers/GeneratePin.util';
import { MailOrderService } from 'src/email/emailorder.service';
import { SmsHelper } from 'src/users/utility/helpers/sms.helper';

@Injectable()
export class ColisService {
  constructor(
    @InjectRepository(ColisEntity)
    private readonly colisRepository: Repository<ColisEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,

    @InjectRepository(ColisTrackingEntity)
    private readonly trackingRepo: Repository<ColisTrackingEntity>,

    private readonly mailService: MailOrderService,

    private readonly smsHelper: SmsHelper,

    // ✅ Tarifs de ramassage (calcul/validation du prix selon le poids)
    private readonly pickupTariffService: PickupTariffService,

    // ✅ F-Pay (encaissement du ramassage sur le compte FAVOR LOGISTIQUE)
    private readonly fpayService: FpayService,
  ) {}

  /**
   * ✅ Résout le ramassage d'un colis : zone, prix (calculé/validé contre le tarif
   * selon le POIDS) et moment/état du paiement.
   *  - Si un prix est saisi, il DOIT correspondre au tarif du poids, sinon erreur.
   *  - Si aucun prix n'est saisi, il est calculé automatiquement depuis la table.
   *  - PAID_TO_SUPPLIER → payé ; PAY_ON_PICKUP → à encaisser (PENDING).
   */
  private async resolvePickup(
    dto: CreateColisDto,
    weight: number,
  ): Promise<Partial<ColisEntity>> {
    const out: Partial<ColisEntity> = {};
    const hasPickup =
      !!dto.pickupCountryId || dto.pickupPrice != null || !!dto.pickupPaymentTiming;
    if (!hasPickup) return out;

    out.pickupCountryId = dto.pickupCountryId ?? null;
    out.pickupCityId = dto.pickupCityId ?? null;

    if (dto.pickupCountryId) {
      // Tarif par le poids : on vérifie que le montant saisi correspond
      const { data } = await this.pickupTariffService.quote({
        countryId: dto.pickupCountryId,
        cityId: dto.pickupCityId,
        weight: Number(weight),
      });
      const expected = Number(data.price);
      if (dto.pickupPrice != null && Math.abs(Number(dto.pickupPrice) - expected) > 0.009) {
        throw new BadRequestException(
          `Le prix de ramassage (${dto.pickupPrice}) ne correspond pas au tarif pour ${weight} kg : attendu ${expected} ${data.currency}.`,
        );
      }
      out.pickupPrice = dto.pickupPrice != null ? Number(dto.pickupPrice) : expected;
      out.pickupCurrency = dto.pickupCurrency ?? data.currency;
      out.pickupTariffId = data.tariffId;
    } else if (dto.pickupPrice != null) {
      // Pas de zone fournie → on garde le prix tel quel (sans validation tarifaire)
      out.pickupPrice = Number(dto.pickupPrice);
      out.pickupCurrency = dto.pickupCurrency ?? 'USD';
    }

    const timing = dto.pickupPaymentTiming ?? null;
    out.pickupPaymentTiming = timing;
    if (dto.pickupPaymentMethod) out.pickupPaymentMethod = dto.pickupPaymentMethod;
    if (timing === ColisPickupPaymentTiming.PAID_TO_SUPPLIER) {
      out.pickupPaymentStatus = ColisPickupPaymentStatus.PAID;
      out.pickupPaidAt = new Date();
    } else {
      out.pickupPaymentStatus = ColisPickupPaymentStatus.PENDING;
    }
    return out;
  }

  /**
   * ✅ Encaissement du ramassage (colis à payer pendant le ramassage).
   * Passe le paiement à PAID et horodate.
   */
  async collectPickupPayment(
    colisId: string,
    dto: CollectPickupPaymentDto,
    currentUser: UserEntity,
  ): Promise<{ message: string; data: ColisEntity }> {
    const colis = await this.colisRepository.findOne({ where: { id: colisId } });
    if (!colis) throw new NotFoundException('Colis non trouvé');
    if (colis.pickupPaymentStatus === ColisPickupPaymentStatus.PAID) {
      throw new BadRequestException('Le ramassage de ce colis est déjà réglé.');
    }

    const amount = colis.pickupPrice != null ? Number(colis.pickupPrice) : 0;
    let reference = dto.reference ?? null;

    if (dto.method === PaymentMethod.FPAY) {
      // ✅ Débit F-Pay encaissé sur le compte FAVOR LOGISTIQUE (clé FPAY_API_KEY_LOGISTIC)
      if (!amount || amount <= 0) {
        throw new BadRequestException('Aucun montant de ramassage à encaisser pour ce colis.');
      }
      if (!dto.access_token) {
        throw new BadRequestException('access_token F-Pay requis pour un paiement FPAY.');
      }
      const resp: any = await this.fpayService.makePayment(
        {
          amount,
          currency: colis.pickupCurrency || 'USD',
          description: `Ramassage colis ${colis.trackingNumber}`,
          access_token: dto.access_token,
        } as any,
        currentUser,
        'LOGISTIC',
      );
      reference = resp?.data?.transaction?.reference ?? reference ?? null;
    }

    colis.pickupPaymentMethod = dto.method;
    colis.pickupPaymentStatus = ColisPickupPaymentStatus.PAID;
    colis.pickupPaidAt = new Date();
    colis.pickupPaymentReference = reference;
    const saved = await this.colisRepository.save(colis);
    return { message: 'Paiement du ramassage encaissé.', data: saved };
  }

  async createColis(
    createColisDto: CreateColisDto,
    currentUser: UserEntity,
  ): Promise<{ message: string; data: ColisEntity }> {
    const user = await this.userRepository.findOne({ where: { id: currentUser.id } });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    const trackingNumber = TrackingNumberUtil.generate();

    // ✅ Ramassage : zone + prix validé selon le poids + moment du paiement
    const pickup = await this.resolvePickup(createColisDto, createColisDto.weight);

    const colis: DeepPartial<ColisEntity> = {
      trackingNumber,
      description: createColisDto.description,
      weight: createColisDto.weight,
      value: createColisDto.value ?? undefined,
      status: ColisStatus.PENDING,
      sender: user,
      senderId: user.id,
      pickupAddress: createColisDto.pickupAddress,
      dropAddress: createColisDto.dropAddress,
      photos:
        Array.isArray(createColisDto.photos) && createColisDto.photos.length > 0
          ? createColisDto.photos
          : undefined,
      ...pickup,
    };

    const savedColis = await this.colisRepository.save(this.colisRepository.create(colis));

    return { message: 'Colis créé avec succès', data: savedColis };
  }

  async assignDriver(
    colisId: string,
    assignCourierDto: AssignCourierDto,
  ): Promise<{ message: string; data: ColisEntity }> {
    const colis = await this.colisRepository.findOne({ where: { id: colisId } });
    if (!colis) throw new NotFoundException('Colis non trouvé');

    const receiver = await this.userRepository.findOne({
      where: { id: assignCourierDto.receiverId },
    });
    if (!receiver) throw new NotFoundException('Rammasseur non trouvé');

    colis.receiver = receiver;
    colis.receiverId = receiver.id;
    colis.status = ColisStatus.IN_TRANSIT;

    const savedColis = await this.colisRepository.save(colis);
    return { message: 'Rammasseur assigné avec succès', data: savedColis };
  }

  async setPrice(
    colisId: string,
    setColisPriceDto: SetColisPriceDto,
  ): Promise<{ message: string; data: ColisEntity }> {
    const colis = await this.colisRepository.findOne({
      where: { id: colisId },
      relations: ['sender'],
    });

    if (!colis) {
      throw new NotFoundException('Colis non trouvé');
    }

    if (!colis.sender) {
      throw new BadRequestException('Ce colis ne possède pas d’expéditeur');
    }

    colis.value = setColisPriceDto.price;
    colis.pin = GeneratePin.generate();

    const hasEmail = colis.sender.email?.trim();
    const hasPhone = colis.sender.phone?.trim();

    if (!hasEmail && !hasPhone) {
      throw new BadRequestException(
        'Aucun moyen de contact disponible (ni email, ni numéro de téléphone).',
      );
    }

    if (hasEmail) {
      await this.mailService.sendHtmlEmail(
        colis.sender.email,
        'Confirmation de paiement et code PIN – FavorHelp',
        'sendPinColis.html',
        {
          pinCode: colis.pin,
          trackingNumber: colis.trackingNumber,
          user: colis.sender,
          colis,
          year: new Date().getFullYear(),
        } as any,
      );
    }

    if (hasPhone) {
      const message = `Paiement confirmé.

Votre colis sera récupéré dans les plus brefs délais par notre livreur.

Numéro de suivi : ${colis.trackingNumber}
Code PIN (à présenter au livreur) : ${colis.pin}

FavorHelp`;

      await this.smsHelper.sendSms(colis.sender.phone, message);
    }

    const savedColis = await this.colisRepository.save(colis);

    return {
      message: 'Prix défini avec succès',
      data: savedColis,
    };
  }

  async getColisById(colisId: string): Promise<{ message: string; data: ColisEntity }> {
    const colis = await this.colisRepository.findOne({
      where: { id: colisId },
      relations: ['sender', 'receiver', 'trackings', 'trackings.updatedBy'],
    });
    if (!colis) throw new NotFoundException('Colis non trouvé');
    return { message: 'Colis récupéré avec succès', data: colis };
  }

  async getAllColis(currentUser?: UserEntity): Promise<{ message: string; data: ColisEntity[] }> {
    // ✅ Sécurité : un utilisateur ne voit que SES colis ; l'admin voit tout.
    const isAdmin = currentUser?.role === UserRole.ADMIN;
    const where = currentUser && !isAdmin ? { senderId: currentUser.id } : {};
    const colisList = await this.colisRepository.find({
      where,
      relations: ['sender', 'receiver', 'trackings', 'trackings.updatedBy'],
      order: { createdAt: 'DESC' },
    });
    return { message: 'Liste des colis récupérée', data: colisList };
  }

  async addTracking(
    colisId: string,
    status: ColisTrackingStatus,
    updatedById?: string,
    location?: string,
    note?: string,
  ): Promise<ColisTrackingEntity> {
    const colis = await this.colisRepository.findOne({ where: { id: colisId } });
    if (!colis) throw new NotFoundException('Colis non trouvé');

    const tracking: DeepPartial<ColisTrackingEntity> = {
      colisId,
      status,
      location,
      note,
      updatedById,
    };

    return this.trackingRepo.save(tracking);
  }

  async getTrackingHistory(colisId: string) {
    const history = await this.trackingRepo.find({
      where: { colisId },
      relations: ['updatedBy'],
      order: { createdAt: 'DESC' },
    });

    return history.map((t) => ({
      id: t.id,
      status: t.status,
      location: t.location ?? null,
      updatedBy: t.updatedBy
        ? {
            id: t.updatedBy.id,
            fullName: t.updatedBy.fullName,
            email: t.updatedBy.email,
            phone: t.updatedBy.phone,
          }
        : null,
      createdAt: t.createdAt,
    }));
  }

  // Suivi d’un colis par trackingNumber
  async trackColis(trackingNumber: string) {
    const colis = await this.colisRepository.findOne({
      where: { trackingNumber },
      relations: ['trackings', 'trackings.updatedBy'],
    });
    if (!colis)
      throw new NotFoundException(`Colis avec trackingNumber ${trackingNumber} introuvable`);

    const sortedTrackings = colis.trackings?.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    return {
      trackingNumber: colis.trackingNumber,
      description: colis.description,
      weight: colis.weight,
      value: colis.value ?? null,
      status: colis.status,
      pickupAddress: colis.pickupAddress,
      dropAddress: colis.dropAddress,

      // ✅ Ramassage : zone, prix (selon le poids) et paiement
      pickupCountryId: colis.pickupCountryId ?? null,
      pickupCityId: colis.pickupCityId ?? null,
      pickupPrice: colis.pickupPrice != null ? Number(colis.pickupPrice) : null,
      pickupCurrency: colis.pickupCurrency ?? null,
      pickupPaymentTiming: colis.pickupPaymentTiming ?? null,
      pickupPaymentStatus: colis.pickupPaymentStatus ?? null,
      pickupPaidAt: colis.pickupPaidAt ?? null,
      pickupPaymentMethod: colis.pickupPaymentMethod ?? null,
      pickupPaymentReference: colis.pickupPaymentReference ?? null,

      trackings: sortedTrackings?.map((t) => ({
        id: t.id,
        status: t.status,
        location: t.location ?? null,
        updatedBy: t.updatedBy
          ? {
              id: t.updatedBy.id,
              fullName: t.updatedBy.fullName,
              email: t.updatedBy.email,
              phone: t.updatedBy.phone,
            }
          : null,
        createdAt: t.createdAt,
      })),
      createdAt: colis.createdAt,
      updatedAt: colis.updatedAt,
    };
  }
}
