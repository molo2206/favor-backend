import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { Room } from 'src/room/entities/room.entity';
import { Repository } from 'typeorm';
import { BookingStatus } from 'src/room/enum/bookingstatus.enum';
import { UserEntity } from 'src/users/entities/user.entity';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class BookingService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,
  ) {}

  async create(createBookingDto: CreateBookingDto, user: UserEntity): Promise<Booking> {
    const { roomId, checkInDate, checkOutDate, guests } = createBookingDto;

    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Chambre introuvable');

    if (guests > room.capacity) {
      throw new BadRequestException(
        `Le nombre de personnes ne peut pas dépasser ${room.capacity}`,
      );
    }

    // Vérification des dates
    const overlappingBooking = await this.bookingRepo
      .createQueryBuilder('booking')
      .where('booking.roomId = :roomId', { roomId })
      .andWhere(
        '(:checkInDate BETWEEN booking.checkInDate AND booking.checkOutDate) OR ' +
          '(:checkOutDate BETWEEN booking.checkInDate AND booking.checkOutDate) OR ' +
          '(booking.checkInDate BETWEEN :checkInDate AND :checkOutDate)',
        { checkInDate, checkOutDate },
      )
      .getOne();

    if (overlappingBooking) {
      throw new BadRequestException('La chambre est déjà occupée pour les dates demandées');
    }

    // Calcul du prix total
    const nbNights =
      (new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) /
      (1000 * 60 * 60 * 24);
    const totalPrice = nbNights * room.price;

    const booking = this.bookingRepo.create({
      ...createBookingDto,
      totalPrice,
      status: BookingStatus.PENDING,
      user, // ajoute ici l'utilisateur qui crée la réservation
    });

    return this.bookingRepo.save(booking);
  }

  async findAll(): Promise<{ message: string; data: any[] }> {
    const bookings = await this.bookingRepo.find({
      relations: ['room', 'user'],
    });

    // Supprimer les mots de passe et transformer les données
    const result = bookings.map((booking) => {
      const { user, ...restBooking } = booking;
      return {
        ...restBooking,
        user: user ? { ...user, password: undefined } : null,
      };
    });

    return {
      message: `${bookings.length} réservation(s) trouvée(s)`,
      data: result,
    };
  }

  async findOne(id: string): Promise<{ message: string; data: any }> {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: ['room', 'user'],
    });

    if (!booking) {
      throw new NotFoundException('Réservation introuvable');
    }

    // Supprimer le mot de passe si présent
    if (booking.user) {
      delete (booking.user as any).password;
    }

    return {
      message: 'Réservation trouvée',
      data: booking,
    };
  }

  async findByUser(user: UserEntity): Promise<{ message: string; data: any[] }> {
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const bookings = await this.bookingRepo.find({
      where: { user: { id: user.id } },
      relations: ['room', 'user'],
    });

    const result = bookings.map((booking) => {
      const { user, ...restBooking } = booking;
      return {
        ...restBooking,
        user: user
          ? {
              ...user,
              password: undefined, // cast nécessaire si TypeScript l'exige
            }
          : null,
      };
    });

    return {
      message: `${bookings.length} réservation(s) trouvée(s) pour l’utilisateur`,
      data: result,
    };
  }
  async update(
    id: string,
    updateBookingDto: UpdateBookingDto,
  ): Promise<{ message: string; data: Booking }> {
    const booking = await this.findOne(id).then((res) => res.data); // récupérer l'objet Booking

    Object.assign(booking, updateBookingDto);

    const updatedBooking = await this.bookingRepo.save(booking);

    return {
      message: 'Réservation mise à jour avec succès',
      data: updatedBooking,
    };
  }

  async remove(id: string): Promise<{ message: string }> {
    const booking = await this.findOne(id).then((res) => res.data);

    await this.bookingRepo.remove(booking);

    return { message: 'Réservation supprimée avec succès' };
  }

  async cancel(id: string, user: UserEntity): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({
      where: { id, userId: user.id },
      relations: ['room', 'user'],
    });

    if (!booking) {
      throw new NotFoundException('Réservation introuvable pour cet utilisateur');
    }

    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        `La réservation ne peut être annulée que si elle est en statut PENDING. Statut actuel : ${booking.status}`,
      );
    }

    booking.status = BookingStatus.CANCELLED;

    return this.bookingRepo.save(booking);
  }
}
