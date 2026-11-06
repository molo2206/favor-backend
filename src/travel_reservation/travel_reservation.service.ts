import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TravelReservationEntity } from './entities/travel_reservation.entity';
import { CreateTravelReservationDto } from './dto/create-travel_reservation.dto';
import { ReservationStatus } from 'src/travel_reservation/enum/reservation.status.enum';
import { UserEntity } from 'src/users/entities/user.entity';

@Injectable()
export class TravelReservationService {
  constructor(
    @InjectRepository(TravelReservationEntity)
    private readonly reservationRepository: Repository<TravelReservationEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  // Créer une réservation
  async createReservation(
    userId: string,
    dto: CreateTravelReservationDto,
  ): Promise<TravelReservationEntity> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const reservation = this.reservationRepository.create({
      ...dto,
      client: user,
      status: ReservationStatus.PENDING,
    });

    const saved = await this.reservationRepository.save(reservation);
    delete (saved.client as any).password;
    return saved;
  }

  // Récupérer toutes les réservations pour un client
  async getReservationsForClient(clientId: string): Promise<TravelReservationEntity[]> {
    const reservations = await this.reservationRepository.find({
      where: { client: { id: clientId } },
      relations: ['client'],
    });

    // Supprimer les passwords
    return reservations.map((res) => {
      if (res.client) delete (res.client as any).password;
      return res;
    });
  }

  // Mettre à jour le statut d'une réservation
  async updateStatus(reservationId: string, status: string): Promise<TravelReservationEntity> {
    const reservation = await this.reservationRepository.findOne({
      where: { id: reservationId },
      relations: ['client'],
    });

    if (!reservation) throw new NotFoundException('Réservation introuvable');

    // Vérifie si le statut est valide
    if (!Object.values(ReservationStatus).includes(status as ReservationStatus)) {
      throw new BadRequestException('Statut de réservation invalide');
    }

    // Règle métier : une réservation confirmée ne peut pas revenir en pending ou annulée
    if (
      reservation.status === ReservationStatus.CONFIRMED &&
      (status === ReservationStatus.PENDING || status === ReservationStatus.CANCELLED)
    ) {
      throw new BadRequestException(
        'Impossible de changer le statut : une réservation confirmée ne peut pas être modifiée en pending ou annulée',
      );
    }

    reservation.status = status as ReservationStatus;
    const saved = await this.reservationRepository.save(reservation);

    if (saved.client) delete (saved.client as any).password;
    return saved;
  }

  // Récupérer toutes les réservations (optionnellement filtrées par statut)
  async findAll(
    status?: ReservationStatus,
  ): Promise<{ message: string; data: TravelReservationEntity[] }> {
    const query = this.reservationRepository
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.client', 'client');

    if (status) {
      query.where('reservation.status = :status', { status });
    }

    const reservations = await query.getMany();
    const sanitized = reservations.map((r) => {
      if (r.client) delete (r.client as any).password;
      return r;
    });

    return {
      message: `${sanitized.length} réservation(s) trouvée(s)`,
      data: sanitized,
    };
  }

  // Récupérer une réservation par ID
  async findOneById(id: string): Promise<TravelReservationEntity> {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ['client'],
    });
    if (!reservation) throw new NotFoundException('Réservation introuvable');

    if (reservation.client) delete (reservation.client as any).password;
    return reservation;
  }

  // Supprimer une réservation
  async removeReservation(id: string): Promise<{ message: string }> {
    const reservation = await this.reservationRepository.findOne({ where: { id } });
    if (!reservation) throw new NotFoundException('Réservation introuvable');

    await this.reservationRepository.remove(reservation);
    return { message: 'Réservation supprimée avec succès' };
  }
}
