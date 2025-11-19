import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomAvailability } from './entity/RoomAvailability.entity';
import { Product } from 'src/products/entities/product.entity';
import { CreateRoomAvailabilityDto } from './dto/create-room-availability-dto';
import { Reservation } from './entity/Reservation.entity';
import { UserEntity } from 'src/users/entities/user.entity';

@Injectable()
export class RoomAvailabilityService {
  constructor(
    @InjectRepository(RoomAvailability)
    private availabilityRepo: Repository<RoomAvailability>,

    @InjectRepository(Product)
    private productRepo: Repository<Product>,

    @InjectRepository(Reservation)
    private reservationRepo: Repository<Reservation>,

    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
  ) {}

  // --------------------------------------------------
  // CREATE / UPDATE AVAILABILITY
  // --------------------------------------------------

  async create(dto: CreateRoomAvailabilityDto) {
    const product = await this.productRepo.findOne({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product (room type) not found');

    const existing = await this.availabilityRepo.findOne({
      where: { product: { id: dto.productId }, date: dto.date },
      relations: ['product'],
    });

    if (existing) {
      existing.roomsAvailable = dto.roomsAvailable;
      await this.availabilityRepo.save(existing);

      return {
        message: 'Availability updated successfully',
        data: existing,
      };
    }

    const a = this.availabilityRepo.create({
      product,
      date: dto.date,
      roomsAvailable: dto.roomsAvailable,
    });

    const saved = await this.availabilityRepo.save(a);

    return {
      message: 'Availability created successfully',
      data: saved,
    };
  }

  // --------------------------------------------------
  // UPDATE (generic)
  // --------------------------------------------------

  async update(id: string, changes: Partial<RoomAvailability>) {
    const existing = await this.availabilityRepo.findOne({
      where: { id },
      relations: ['product'],
    });
    if (!existing) throw new NotFoundException('Availability not found');

    Object.assign(existing, changes);
    const saved = await this.availabilityRepo.save(existing);

    return {
      message: 'Availability updated successfully',
      data: saved,
    };
  }

  // --------------------------------------------------
  // GET CALENDAR BETWEEN DATES
  // --------------------------------------------------

  async findForProductBetween(productId: string, from: string, to: string) {
    const data = await this.availabilityRepo
      .createQueryBuilder('a')
      .where('a.productId = :productId', { productId })
      .andWhere('a.date >= :from AND a.date < :to', { from, to })
      .orderBy('a.date', 'ASC')
      .getMany();

    return {
      message: 'Availability fetched successfully',
      data,
    };
  }

  // --------------------------------------------------
  // GENERATE DEFAULT CALENDAR
  // --------------------------------------------------

  async generateCalendar(productId: string, from: string, to: string) {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    const dates = this.listDates(from, to);
    const toSave: RoomAvailability[] = [];

    for (const date of dates) {
      const existing = await this.availabilityRepo.findOne({
        where: { product: { id: productId }, date },
      });

      if (!existing) {
        const entry = this.availabilityRepo.create({
          product,
          date,
          roomsAvailable: product.quantity ?? 0,
        });
        toSave.push(entry);
      }
    }

    if (toSave.length) await this.availabilityRepo.save(toSave);

    return {
      message: 'Calendar generated successfully',
      data: { created: toSave.length },
    };
  }

  // --------------------------------------------------
  // RESERVATION
  // --------------------------------------------------

  async reserveRoom(
    userId: string,
    dto: {
      productId: string;
      startDate: string;
      endDate: string;
      adults: number;
      children: number;
      roomsBooked: number;
    },
  ) {
    // Récupérer le produit (room type)
    const product = await this.productRepo.findOne({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Room type not found');

    // Récupérer l'utilisateur
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Générer la liste des dates entre start et end
    const dates = this.listDates(dto.startDate, dto.endDate);

    // Vérifier la disponibilité pour chaque date
    const availability = await this.availabilityRepo.find({
      where: dates.map((d) => ({
        product: { id: dto.productId },
        date: d,
      })),
      relations: ['product'],
    });

    for (const day of dates) {
      const avail = availability.find((a) => a.date === day);
      if (!avail || avail.roomsAvailable < dto.roomsBooked) {
        throw new BadRequestException(`Not enough rooms available on date ${day}`);
      }
    }

    // Déduire les chambres réservées
    for (const a of availability) {
      a.roomsAvailable -= dto.roomsBooked;
    }
    await this.availabilityRepo.save(availability);

    // Créer la réservation
    const reservation = this.reservationRepo.create({
      user, // relation UserEntity
      product, // relation Product
      startDate: dto.startDate,
      endDate: dto.endDate,
      adults: dto.adults,
      children: dto.children,
      roomsBooked: dto.roomsBooked,
    });

    const saved = await this.reservationRepo.save(reservation);

    return {
      message: 'Reservation confirmed successfully',
      data: saved,
    };
  }

  // --------------------------------------------------
  // TOOLS
  // --------------------------------------------------

  private listDates(start: string, end: string): string[] {
    const res: string[] = [];
    const s = new Date(start);
    const e = new Date(end);
    for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) {
      res.push(d.toISOString().slice(0, 10));
    }
    return res;
  }
}
