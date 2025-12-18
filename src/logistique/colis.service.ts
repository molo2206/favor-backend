import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { ColisEntity, ColisStatus } from './entity/colis.entity';
import { ColisTrackingEntity, ColisTrackingStatus } from './entity/colis-tracking.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { CreateColisDto } from './dto/create-colis.dto';
import { SetColisPriceDto } from './dto/set-price.dto';
import { AssignCourierDto } from './dto/assign-courier.dto';
import { TrackingNumberUtil } from 'src/users/utility/helpers/tracking-number.util';

@Injectable()
export class ColisService {
  constructor(
    @InjectRepository(ColisEntity)
    private readonly colisRepository: Repository<ColisEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,

    @InjectRepository(ColisTrackingEntity)
    private readonly trackingRepo: Repository<ColisTrackingEntity>,
  ) {}

  // Création d'un colis
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

  // Assigner un ramasseur / transporteur
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

  // Définir le prix
  async setPrice(
    colisId: string,
    setColisPriceDto: SetColisPriceDto,
  ): Promise<{ message: string; data: ColisEntity }> {
    const colis = await this.colisRepository.findOne({ where: { id: colisId } });
    if (!colis) throw new NotFoundException('Colis non trouvé');

    colis.value = setColisPriceDto.price;

    const savedColis = await this.colisRepository.save(colis);
    return { message: 'Prix défini avec succès', data: savedColis };
  }

  // Récupérer un colis par ID
  async getColisById(colisId: string): Promise<{ message: string; data: ColisEntity }> {
    const colis = await this.colisRepository.findOne({
      where: { id: colisId },
      relations: ['sender', 'receiver', 'trackings', 'trackings.updatedBy'],
    });
    if (!colis) throw new NotFoundException('Colis non trouvé');
    return { message: 'Colis récupéré avec succès', data: colis };
  }

  // Récupérer tous les colis
  async getAllColis(): Promise<{ message: string; data: ColisEntity[] }> {
    const colisList = await this.colisRepository.find({
      relations: ['sender', 'receiver', 'trackings', 'trackings.updatedBy'],
      order: { createdAt: 'DESC' },
    });
    return { message: 'Liste des colis récupérée', data: colisList };
  }

  // Ajouter un tracking
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
      colisId, // juste l'ID
      status,
      location: location ?? undefined,
      note: note ?? undefined,
      updatedById: updatedById ?? undefined, // undefined si pas de user
    };

    return this.trackingRepo.save(tracking);
  }

  // Historique des trackings
  async getTrackingHistory(colisId: string) {
    const history = await this.trackingRepo.find({
      where: { colisId },
      relations: ['updatedBy'],
      order: { createdAt: 'ASC' },
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
      relations: ['sender', 'receiver', 'trackings', 'trackings.updatedBy'],
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
      sender: colis.sender
        ? {
            id: colis.sender.id,
            fullName: colis.sender.fullName,
            email: colis.sender.email,
            phone: colis.sender.phone,
          }
        : null,
      receiver: colis.receiver
        ? {
            id: colis.receiver.id,
            fullName: colis.receiver.fullName,
            email: colis.receiver.email,
            phone: colis.receiver.phone,
          }
        : null,
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
