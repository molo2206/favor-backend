import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Like, Repository } from 'typeorm';
import { RoomAvailability } from './entity/RoomAvailability.entity';
import { Product } from 'src/products/entities/product.entity';
import { Reservation } from './entity/Reservation.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { CreateRoomAvailabilityDto } from './dto/create-room-availability-dto';
import { classToPlain } from 'class-transformer';
import { PriceCalculator } from 'src/users/utility/helpers/price-calculator.util';
import { SearchRoomsDto } from './dto/search-room-dtod';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { CompanyEntity } from 'src/company/entities/company.entity';

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

    @InjectRepository(CompanyEntity)
    private companyRepo: Repository<CompanyEntity>,
  ) {}

  // -------------------------------
  // CREATE / UPDATE AVAILABILITY
  // -------------------------------
  async create(dto: CreateRoomAvailabilityDto) {
    const product = await this.productRepo.findOne({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product (room type) not found');

    const existing = await this.availabilityRepo.findOne({
      where: { product: { id: dto.productId }, date: dto.date },
      relations: ['product'],
    });

    if (existing) {
      existing.roomsAvailable = dto.roomsAvailable;
      existing.roomsRemaining = existing.roomsAvailable - (existing.roomsBooked ?? 0);
      const saved = await this.availabilityRepo.save(existing);
      return { message: 'Availability updated successfully', data: saved };
    }

    const availability = this.availabilityRepo.create({
      product,
      date: dto.date,
      roomsAvailable: dto.roomsAvailable,
      roomsBooked: dto.roomsBooked ?? 0,
      roomsRemaining: (dto.roomsAvailable ?? product.quantity) - (dto.roomsBooked ?? 0),
    });

    const saved = await this.availabilityRepo.save(availability);
    return { message: 'Availability created successfully', data: saved };
  }

  async update(id: string, changes: Partial<RoomAvailability>) {
    const existing = await this.availabilityRepo.findOne({
      where: { id },
      relations: ['product'],
    });
    if (!existing) throw new NotFoundException('Availability not found');

    Object.assign(existing, changes);
    existing.roomsRemaining = existing.roomsAvailable - existing.roomsBooked;
    const saved = await this.availabilityRepo.save(existing);

    return { message: 'Availability updated successfully', data: saved };
  }

  async findForProductBetween(productId: string, from: string, to: string) {
    const data = await this.availabilityRepo
      .createQueryBuilder('a')
      .where('a.productId = :productId', { productId })
      .andWhere('a.date >= :from AND a.date <= :to', { from, to })
      .orderBy('a.date', 'ASC')
      .getMany();

    return { message: 'Availability fetched successfully', data };
  }

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
          roomsBooked: 0,
          roomsRemaining: product.quantity ?? 0,
        });
        toSave.push(entry);
      }
    }

    if (toSave.length) await this.availabilityRepo.save(toSave);
    return { message: 'Calendar generated successfully', data: { created: toSave.length } };
  }

  async reserveRoom(
    userId: string,
    dto: {
      productId: string;
      startDate: string;
      endDate: string;
      adults: number;
      children: number;
      roomsBooked: number;
      quantity?: number;
      specialRequest?: string;
    },
  ) {
    const product = await this.productRepo.findOne({
      where: { id: dto.productId },
      select: ['id', 'price', 'detail', 'gros', 'dailyRate', 'salePrice', 'name'],
    });
    if (!product) throw new NotFoundException('Type de chambre non trouvé');

    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'fullName', 'email', 'phone', 'image', 'role', 'country', 'city'],
    });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    const dates = this.listDates(dto.startDate, dto.endDate);
    const DEFAULT_ROOMS_AVAILABLE = 10;

    // 🔴 CORRECTION : Stocker les disponibilités à mettre à jour
    const availabilityRecords: RoomAvailability[] = [];

    // 🔴 VÉRIFICATION : Vérifier/créer la disponibilité pour chaque date
    for (const date of dates) {
      let availability = await this.availabilityRepo.findOne({
        where: { product: { id: dto.productId }, date },
      });

      // Si la disponibilité n'existe pas, la créer
      if (!availability) {
        availability = this.availabilityRepo.create({
          product,
          date,
          roomsAvailable: DEFAULT_ROOMS_AVAILABLE,
          roomsBooked: 0,
          roomsRemaining: DEFAULT_ROOMS_AVAILABLE,
        });
        // 🔴 CORRECTION : Sauvegarder immédiatement la nouvelle disponibilité
        availability = await this.availabilityRepo.save(availability);
      }

      // Vérifier la disponibilité
      if (availability.roomsAvailable < dto.roomsBooked) {
        throw new BadRequestException(
          `Désolé, il ne reste que ${availability.roomsAvailable} chambre(s) disponible(s) pour le ${date}. Vous avez demandé ${dto.roomsBooked} chambre(s).`,
        );
      }

      // Mettre à jour la disponibilité
      availability.roomsAvailable -= dto.roomsBooked;
      availability.roomsBooked += dto.roomsBooked;
      availability.roomsRemaining = availability.roomsAvailable;

      availabilityRecords.push(availability);
    }

    // 🔴 CORRECTION : Sauvegarder toutes les disponibilités en une fois
    await this.availabilityRepo.save(availabilityRecords);

    // Calcul du prix et création réservation
    const calculatedTotalPrice = PriceCalculator.calculateTotalPrice(
      product,
      dto.startDate,
      dto.endDate,
      dto.roomsBooked,
      dto.quantity,
    );

    const reservation = this.reservationRepo.create({
      user,
      product,
      startDate: dto.startDate,
      endDate: dto.endDate,
      adults: dto.adults,
      children: dto.children,
      roomsBooked: dto.roomsBooked,
      quantity: dto.quantity ?? dto.roomsBooked,
      totalPrice: calculatedTotalPrice,
      specialRequest: dto.specialRequest,
    });

    const saved = await this.reservationRepo.save(reservation);

    return {
      message: 'Réservation confirmée avec succès',
      data: saved,
    };
  }

  private listDates(start: string, end: string): string[] {
    const res: string[] = [];
    const s = new Date(start);
    const e = new Date(end);
    for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) {
      res.push(d.toISOString().slice(0, 10));
    }
    return res;
  }

  async searchProductsByDestination({
    destination,
    startDate,
    endDate,
    adults = 1,
    children = 0,
    rooms = 1,
  }: {
    destination?: string;
    startDate?: string;
    endDate?: string;
    adults?: number;
    children?: number;
    rooms?: number;
  }) {
    // 1. Récupérer les companies HOTEL avec leurs produits
    const queryBuilder = this.companyRepo
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.city', 'city')
      .leftJoinAndSelect('company.country', 'country')
      .leftJoinAndSelect('company.products', 'product')
      .where('company.typeCompany = :typeCompany', { typeCompany: 'HOTEL' });

    if (destination) {
      queryBuilder.andWhere('(city.name LIKE :destination OR country.name LIKE :destination)', {
        destination: `%${destination}%`,
      });
    }

    const companies = await queryBuilder.getMany();

    // Typage propre
    const availableProducts: Array<any> = [];

    // 2. Parcourir les companies + produits
    for (const company of companies) {
      for (const product of company.products) {
        // 2A. Vérifier capacité adulte/enfants
        const canAccommodate =
          adults <= (product.capacityAdults ?? 0) &&
          children <= (product.capacityChildren ?? 0);

        if (!canAccommodate) continue;

        // 2B. Vérifier disponibilité (dates optionnelles)
        let availabilities: RoomAvailability[] = [];

        const whereClause: any = { product: { id: product.id } };

        if (startDate && endDate) {
          whereClause.date = Between(startDate, endDate);
        }

        availabilities = await this.availabilityRepo.find({
          where: whereClause,
        });

        // Si pas de disponibilités → passer
        if (availabilities.length === 0) continue;

        // Vérifier pour chaque jour qu’il reste assez de chambres
        const allDaysAvailable = availabilities.every(
          (a) => (a.roomsRemaining ?? a.roomsAvailable - a.roomsBooked) >= rooms,
        );

        if (!allDaysAvailable) continue;

        // 3. Ajouter le produit + company
        availableProducts.push({
          ...product,
          company,
        });
      }
    }

    return {
      message: `Produits disponibles récupérés pour les hôtels à la destination : ${destination}`,
      data: availableProducts,
    };
  }
}
