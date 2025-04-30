import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TravelReservationEntity } from './entities/travel_reservation.entity';
import { CreateTravelReservationDto } from './dto/create-travel_reservation.dto';
import { ReservationStatus } from 'src/users/utility/common/reservation.status.enum';
import { UserEntity } from 'src/users/entities/user.entity';

@Injectable()
export class TravelReservationService {
  constructor(
    @InjectRepository(TravelReservationEntity)
    private readonly reservationRepository: Repository<TravelReservationEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) { }

  async createReservation(userId: string, dto: CreateTravelReservationDto): Promise<TravelReservationEntity> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const reservation = this.reservationRepository.create({
      ...dto,
      client: user,  // Associe l'utilisateur trouvé à la réservation
      status: ReservationStatus.PENDING,  // Statut par défaut
    });

    return await this.reservationRepository.save(reservation);
  }


  async getReservationsForClient(clientId: string): Promise<TravelReservationEntity[]> {
    return await this.reservationRepository.find({
      where: { client: { id: clientId } },
      relations: ['client'],
    });
  }

  async updateStatus(reservationId: string, status: string): Promise<TravelReservationEntity> {
    const reservation = await this.reservationRepository.findOne({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException('Réservation introuvable');

    if (!Object.values(ReservationStatus).includes(status as ReservationStatus)) {
      throw new BadRequestException('Statut de réservation invalide');
    }

    reservation.status = status as ReservationStatus;
    return await this.reservationRepository.save(reservation);
  }
}
