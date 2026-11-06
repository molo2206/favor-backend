import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { ColisEntity, ColisStatus } from './entity/colis.entity';
import { ColisTrackingEntity, ColisTrackingStatus } from './entity/colis-tracking.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { CreateColisDto } from './dto/create-colis.dto';
import { SetColisPriceDto } from './dto/set-price.dto';
import { AssignCourierDto } from './dto/assign-courier.dto';
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
  ) {}

  async createColis(
    createColisDto: CreateColisDto,
    currentUser: UserEntity,
  ): Promise<{ message: string; data: ColisEntity }> {
    const user = await this.userRepository.findOne({ where: { id: currentUser.id } });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    const trackingNumber = TrackingNumberUtil.generate();

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

  async getAllColis(): Promise<{ message: string; data: ColisEntity[] }> {
    const colisList = await this.colisRepository.find({
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
